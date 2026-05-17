import { and, eq } from "drizzle-orm";
import type { R2Bucket } from "@cloudflare/workers-types";
import { db } from "$lib/server/db";
import { projects, orgs, gitSources, syncFileErrors } from "$lib/server/db/schema";
import { parseGithubUrl } from "$lib/git/github-url";
import { fetchTree, fetchCompare, fetchTags, type GitHubResult } from "$lib/git/github-api";
import { fetchGlobalSitemap, type GlobalSitemapResult } from "./sitemap";
import { isDocoFile } from "./file-scope";
import {
  processFile,
  processFileRename,
  processFileDelete,
  type ProcessFileContext,
  type ProcessFileResult,
} from "./process-file";

// Top-level sync orchestrator. Invoked by the cron handler, the webhook
// receiver, and the project-create flow's waitUntil. Loads the project's git
// source, decides initial vs incremental sync, processes files, and updates
// sync state.
//
// One GitHub API call per run (tree for initial, compare for incremental).
// Content fetching is offloaded to jsDelivr inside processFile.

export interface SyncRunCounts {
  created: number;
  updated: number;
  deleted: number;
  renamed: number;
  errored: number;
}

export type SyncRunResult =
  | {
      status: "success" | "skipped_no_change";
      resolvedSha: string;
      counts: SyncRunCounts;
    }
  | {
      status: "error" | "rate_limited";
      message: string;
      retryAfterSeconds?: number;
      counts: SyncRunCounts;
    }
  | { status: "not_found"; message: string; counts: SyncRunCounts };

const ZERO_COUNTS: SyncRunCounts = {
  created: 0,
  updated: 0,
  deleted: 0,
  renamed: 0,
  errored: 0,
};

export async function syncProject(projectId: string, bucket: R2Bucket): Promise<SyncRunResult> {
  // Load everything in one query. innerJoin on git_sources means we get a
  // row back only if the project has a git source attached.
  const rows = await db
    .select({
      projectId: projects.id,
      projectSlug: projects.slug,
      orgSlug: orgs.slug,
      sourceMode: projects.sourceMode,
      gitSourceId: gitSources.id,
      provider: gitSources.provider,
      repoUrl: gitSources.repoUrl,
      defaultBranch: gitSources.defaultBranch,
      subpath: gitSources.subpath,
      lastSyncedCommit: gitSources.lastSyncedCommit,
    })
    .from(projects)
    .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
    .innerJoin(gitSources, eq(gitSources.projectId, projects.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  if (rows.length === 0) {
    return {
      status: "not_found",
      message: `Project ${projectId} not found or has no git source`,
      counts: ZERO_COUNTS,
    };
  }
  const r = rows[0];

  if (r.provider !== "github") {
    // Only GitHub is wired up in v1. Other providers come later.
    return await markError(
      r.gitSourceId,
      `Provider ${r.provider} is not supported yet`,
      ZERO_COUNTS,
    );
  }

  const parsed = parseGithubUrl(r.repoUrl);
  if (parsed === null) {
    return await markError(
      r.gitSourceId,
      `Could not parse GitHub repo URL: ${r.repoUrl}`,
      ZERO_COUNTS,
    );
  }

  // Mark syncing. From here on, every exit path either transitions to idle
  // (success / no-change), error (unrecoverable), or rate_limited (defer).
  await db
    .update(gitSources)
    .set({ syncStatus: "syncing", updatedAt: new Date() })
    .where(eq(gitSources.id, r.gitSourceId));

  if (r.lastSyncedCommit === null) {
    return await runInitialSync({
      bucket,
      projectId: r.projectId,
      projectSlug: r.projectSlug,
      orgSlug: r.orgSlug,
      gitSourceId: r.gitSourceId,
      owner: parsed.owner,
      repo: parsed.repo,
      branch: r.defaultBranch,
      subpath: r.subpath,
    });
  }
  return await runIncrementalSync({
    bucket,
    projectId: r.projectId,
    projectSlug: r.projectSlug,
    orgSlug: r.orgSlug,
    gitSourceId: r.gitSourceId,
    owner: parsed.owner,
    repo: parsed.repo,
    branch: r.defaultBranch,
    subpath: r.subpath,
    base: r.lastSyncedCommit,
  });
}

// ---------- modes ----------

interface ModeBase {
  bucket: R2Bucket;
  projectId: string;
  projectSlug: string;
  orgSlug: string;
  gitSourceId: string;
  owner: string;
  repo: string;
  branch: string;
  subpath: string | null;
}

async function runInitialSync(ctx: ModeBase): Promise<SyncRunResult> {
  const tree = await fetchTree(ctx.owner, ctx.repo, ctx.branch);
  if (!tree.ok) return await handleGitHubFailure(ctx.gitSourceId, tree, ZERO_COUNTS);

  const resolvedSha = tree.value.sha;
  const eligible: string[] = [];
  for (const entry of tree.value.tree) {
    if (entry.type === "blob" && isDocoFile(entry.path, ctx.subpath)) {
      eligible.push(entry.path);
    }
  }

  const globalSitemap = await fetchGlobalSitemap({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: resolvedSha,
    subpath: ctx.subpath,
  });

  const versionTag = await resolveTagForSha(ctx.owner, ctx.repo, resolvedSha);
  const counts = await processFiles(eligible, [], [], ctx, resolvedSha, versionTag, globalSitemap);
  return await markIdle(ctx.gitSourceId, resolvedSha, counts);
}

async function runIncrementalSync(ctx: ModeBase & { base: string }): Promise<SyncRunResult> {
  const compare = await fetchCompare(ctx.owner, ctx.repo, ctx.base, ctx.branch);
  if (!compare.ok) return await handleGitHubFailure(ctx.gitSourceId, compare, ZERO_COUNTS);

  if (compare.value.truncated) {
    // Compare endpoint capped (250 commits / 300 files). For v1 fall back
    // to error and let the operator decide; a fresh-tree fallback can come
    // later. Per sync-engine spec this is rare in practice.
    return await markError(
      ctx.gitSourceId,
      "GitHub compare response was truncated (>250 commits or >300 files). Run a full re-sync.",
      ZERO_COUNTS,
    );
  }

  const resolvedSha = compare.value.resolvedSha;

  const toProcess: string[] = [];
  const toRename: { oldPath: string; newPath: string; alsoModified: boolean }[] = [];
  const toDelete: string[] = [];

  // Files with lingering errors from a previous sync get re-processed even
  // when GitHub reports no change. This is how schema/validator fixes
  // propagate without requiring the user to push a no-op commit. Critical:
  // load BEFORE the "no-op" short-circuit below; otherwise an identical
  // compare would bail and stale errors would never clear.
  const erroredRows = await db
    .select({ filePath: syncFileErrors.filePath })
    .from(syncFileErrors)
    .where(eq(syncFileErrors.projectId, ctx.projectId));

  for (const f of compare.value.files) {
    if (!isDocoFile(f.filename, ctx.subpath)) {
      // Renames where the old path was a doco but the new one isn't (or
      // vice versa) are edge cases; treat as delete-then-add via separate
      // entries. For v1 ignore non-doco files entirely.
      if (
        f.status === "renamed" &&
        f.previousFilename !== undefined &&
        isDocoFile(f.previousFilename, ctx.subpath)
      ) {
        toDelete.push(f.previousFilename);
      }
      continue;
    }
    if (f.status === "added" || f.status === "modified" || f.status === "changed") {
      toProcess.push(f.filename);
    } else if (f.status === "renamed") {
      // Renames inside the eligible scope: update pathInSource. If content
      // also changed in the same commit, we process the new path too.
      if (f.previousFilename !== undefined) {
        toRename.push({
          oldPath: f.previousFilename,
          newPath: f.filename,
          alsoModified: true,
        });
        toProcess.push(f.filename);
      }
    } else if (f.status === "removed") {
      toDelete.push(f.filename);
    }
    // `copied` and `unchanged` are ignored: copied = treated as an add
    // (unlikely from GitHub anyway), unchanged = nothing to do.
  }

  // Fold in errored files that the compare didn't already cover. Eligible
  // files get re-processed; ineligible ones (subpath changed, etc.) get
  // their stale error row cleared.
  const toProcessSet = new Set(toProcess);
  const toDeleteSet = new Set(toDelete);
  for (const { filePath } of erroredRows) {
    if (toProcessSet.has(filePath) || toDeleteSet.has(filePath)) continue;
    if (isDocoFile(filePath, ctx.subpath)) {
      toProcess.push(filePath);
    } else {
      await clearFileError(ctx.projectId, filePath);
    }
  }

  // Now that errored files are folded in, check if there's actually anything
  // to do. If compare reported identical AND no errored files needed retrying,
  // short-circuit with a lastSyncedAt touch so the project doesn't keep
  // bubbling to the top of the hourly queue.
  if (toProcess.length === 0 && toRename.length === 0 && toDelete.length === 0) {
    await db
      .update(gitSources)
      .set({
        syncStatus: "idle",
        lastSyncedAt: new Date(),
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(gitSources.id, ctx.gitSourceId));
    return {
      status: "skipped_no_change",
      resolvedSha,
      counts: ZERO_COUNTS,
    };
  }

  // Renames must be processed before adds so the lookup on the OLD path
  // finds the original doco, not a freshly-inserted one at the same name.
  const renameCounts = { renamed: 0 };
  for (const rn of toRename) {
    const result = await processFileRename(rn.oldPath, rn.newPath, ctx.gitSourceId);
    if (result.status === "renamed") renameCounts.renamed += 1;
  }

  const globalSitemap = await fetchGlobalSitemap({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: resolvedSha,
    subpath: ctx.subpath,
  });

  const versionTag = await resolveTagForSha(ctx.owner, ctx.repo, resolvedSha);
  const counts = await processFiles(
    toProcess,
    toRename,
    toDelete,
    ctx,
    resolvedSha,
    versionTag,
    globalSitemap,
  );
  counts.renamed = renameCounts.renamed;
  return await markIdle(ctx.gitSourceId, resolvedSha, counts);
}

// Looks up a tag name pointing at the resolved commit, if one exists. Returns
// null on tag fetch failure: tag display is a nice-to-have, never block a
// sync over it. First matching tag wins when multiple point at the same
// commit (rare; can refine later if a real repo needs deterministic picks).
async function resolveTagForSha(owner: string, repo: string, sha: string): Promise<string | null> {
  const tags = await fetchTags(owner, repo);
  if (!tags.ok) return null;
  for (const tag of tags.value) {
    if (tag.commitSha === sha) return tag.name;
  }
  return null;
}

// ---------- per-file batching ----------

async function processFiles(
  toProcess: string[],
  // toRename is only forwarded for symmetry; rename row updates already happened
  // above the call. Kept here so the signature documents the full file-change set.
  _toRename: { oldPath: string; newPath: string; alsoModified: boolean }[],
  toDelete: string[],
  ctx: ModeBase,
  resolvedSha: string,
  versionTag: string | null,
  globalSitemap: GlobalSitemapResult,
): Promise<SyncRunCounts> {
  const counts: SyncRunCounts = { ...ZERO_COUNTS };

  const fileCtx: ProcessFileContext = {
    bucket: ctx.bucket,
    projectId: ctx.projectId,
    gitSourceId: ctx.gitSourceId,
    owner: ctx.owner,
    repo: ctx.repo,
    ref: resolvedSha,
    versionTag,
    orgSlug: ctx.orgSlug,
    projectSlug: ctx.projectSlug,
    globalSitemap,
  };

  for (const path of toProcess) {
    const result = await processFile(path, fileCtx);
    await applyFileResult(ctx.projectId, path, result, counts);
  }

  for (const path of toDelete) {
    const result = await processFileDelete(path, ctx.gitSourceId);
    if (result.status === "deleted") {
      counts.deleted += 1;
      await clearFileError(ctx.projectId, path);
    }
  }

  return counts;
}

async function applyFileResult(
  projectId: string,
  filePath: string,
  result: ProcessFileResult,
  counts: SyncRunCounts,
): Promise<void> {
  if (result.status === "errored") {
    counts.errored += 1;
    await recordFileError(
      projectId,
      filePath,
      result.errorCode,
      result.errorMessage,
      result.errorDetails,
    );
    return;
  }
  if (result.status === "created") counts.created += 1;
  if (result.status === "updated") counts.updated += 1;
  await clearFileError(projectId, filePath);
}

// ---------- error surface ----------

async function recordFileError(
  projectId: string,
  filePath: string,
  errorCode: string,
  errorMessage: string,
  errorDetails: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(syncFileErrors)
    .values({
      projectId,
      filePath,
      errorCode,
      errorMessage,
      errorDetails,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [syncFileErrors.projectId, syncFileErrors.filePath],
      set: {
        errorCode,
        errorMessage,
        errorDetails,
        syncedAt: new Date(),
      },
    });
}

async function clearFileError(projectId: string, filePath: string): Promise<void> {
  await db
    .delete(syncFileErrors)
    .where(and(eq(syncFileErrors.projectId, projectId), eq(syncFileErrors.filePath, filePath)));
}

// ---------- state transitions ----------

async function markIdle(
  gitSourceId: string,
  resolvedSha: string,
  counts: SyncRunCounts,
): Promise<SyncRunResult> {
  await db
    .update(gitSources)
    .set({
      syncStatus: "idle",
      lastSyncedCommit: resolvedSha,
      lastSyncedAt: new Date(),
      syncError: null,
      updatedAt: new Date(),
    })
    .where(eq(gitSources.id, gitSourceId));
  return { status: "success", resolvedSha, counts };
}

async function markError(
  gitSourceId: string,
  message: string,
  counts: SyncRunCounts,
): Promise<SyncRunResult> {
  await db
    .update(gitSources)
    .set({
      syncStatus: "error",
      syncError: message,
      updatedAt: new Date(),
    })
    .where(eq(gitSources.id, gitSourceId));
  return { status: "error", message, counts };
}

// On GitHub rate limit, set lastSyncedAt to the epoch so this project sorts
// first in the next hourly cron tick (the orchestrator picks oldest first).
// sync_status stays idle since this isn't really an error, just deferred.
async function markRateLimited(
  gitSourceId: string,
  message: string,
  retryAfterSeconds: number | undefined,
  counts: SyncRunCounts,
): Promise<SyncRunResult> {
  await db
    .update(gitSources)
    .set({
      syncStatus: "idle",
      lastSyncedAt: new Date(0),
      syncError: null,
      updatedAt: new Date(),
    })
    .where(eq(gitSources.id, gitSourceId));
  return { status: "rate_limited", message, retryAfterSeconds, counts };
}

async function handleGitHubFailure<T>(
  gitSourceId: string,
  failure: Extract<GitHubResult<T>, { ok: false }>,
  counts: SyncRunCounts,
): Promise<SyncRunResult> {
  if (failure.reason === "rate_limited") {
    return await markRateLimited(gitSourceId, failure.message, failure.retryAfterSeconds, counts);
  }
  return await markError(gitSourceId, failure.message, counts);
}
