import { and, eq, inArray, isNull, like } from "drizzle-orm";
import type { R2Bucket } from "@cloudflare/workers-types";
import { db } from "$lib/server/db";
import { projects, orgs, gitSources, syncFileErrors, docos, versions } from "$lib/server/db/schema";
import { forgeFor, isForgeProvider, parseForgeRepoUrl, type Forge } from "$lib/git/forge";
import type { GitHubResult } from "$lib/git/github-api";
import {
  createSitemapResolver,
  isDocoSitemapFile,
  dirOf,
  type SitemapResolver,
  type SitemapResolution,
} from "./sitemap";
import type { Sitemap } from "./sitemap-schema";
import { isDocoFile } from "./file-scope";
import {
  findMintlifyConfig,
  configPathsFor,
  docsDirForConfig,
  parseMintlifyConfig,
  type MintlifyIconLibrary,
} from "./mintlify/detect";
import { navToSitemap } from "./mintlify/nav-to-sitemap";
import {
  processFile,
  validateFile,
  processFileRename,
  processFileDelete,
  type ProcessFileContext,
  type ProcessFileResult,
} from "./process-file";
import { pathFromSourcePath, publicLatestUrls } from "$lib/doco-urls";
import { resolveSitemapLinks } from "$lib/doco/resolve-link";
import { purgeCacheUrls } from "./cache-purge";

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

export const ZERO_COUNTS: SyncRunCounts = {
  created: 0,
  updated: 0,
  deleted: 0,
  renamed: 0,
  errored: 0,
};

// ---------- top-level orchestration ----------

// A serializable description of one sync run: which commit to sync to and the
// file work to do. Persisted in sync_jobs so a drain resumes it across bounded
// invocations; also used in-memory by the single-shot syncProject path. Renames
// are executed at plan time (they must precede adds), so the plan only carries
// their old paths for the finalize cache purge.
export interface SyncPlan {
  isInitial: boolean;
  targetSha: string;
  baseSha: string | null;
  versionTag: string | null;
  mintlify: MintlifyMode | null;
  pending: string[];
  deletes: string[];
  renameOlds: string[];
  renamedCount: number;
  // The full upsert set at plan time: the skip set for sitemap re-resolution and,
  // for an initial sync, the present-file set for the reconciliation sweep.
  processedSeed: string[];
  changedSitemaps: { path: string; removed: boolean }[];
  configChanged: boolean;
}

export type PlanResult =
  | { kind: "plan"; plan: SyncPlan }
  | { kind: "terminal"; result: SyncRunResult };

export interface LoadedSource {
  ctx: ModeBase;
  lastSyncedCommit: string | null;
}

// Loads a project's git source and builds the sync context, or returns a terminal
// result (project missing / soft-deleted / unsupported provider / unparseable
// URL). The deletedAt guards stop a queued job from re-syncing and un-deleting
// the docos of a project or org that was soft-deleted while the job waited.
export async function loadSyncContext(
  projectId: string,
  bucket: R2Bucket,
): Promise<LoadedSource | { terminal: SyncRunResult }> {
  const rows = await db
    .select({
      projectId: projects.id,
      projectSlug: projects.slug,
      orgSlug: orgs.slug,
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
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt), isNull(orgs.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    return {
      terminal: {
        status: "not_found",
        message: `Project ${projectId} not found, deleted, or has no git source`,
        counts: ZERO_COUNTS,
      },
    };
  }
  const r = rows[0];
  if (!isForgeProvider(r.provider)) {
    return {
      terminal: await markError(
        r.gitSourceId,
        `Provider ${r.provider} is not supported yet`,
        ZERO_COUNTS,
      ),
    };
  }
  const parsed = parseForgeRepoUrl(r.provider, r.repoUrl);
  if (parsed === null) {
    return {
      terminal: await markError(
        r.gitSourceId,
        `Could not parse repo URL for provider ${r.provider}: ${r.repoUrl}`,
        ZERO_COUNTS,
      ),
    };
  }
  const forge = forgeFor(r.provider, parsed.owner, parsed.repo);
  const ctx: ModeBase = {
    bucket,
    forge,
    repoUrl: r.repoUrl,
    projectId: r.projectId,
    projectSlug: r.projectSlug,
    orgSlug: r.orgSlug,
    gitSourceId: r.gitSourceId,
    branch: r.defaultBranch,
    subpath: r.subpath,
  };
  return { ctx, lastSyncedCommit: r.lastSyncedCommit };
}

// Decides initial vs incremental and builds the plan, or returns a terminal
// result that already wrote sync state (no-op idle, error, rate-limited). The
// caller has set sync_status='syncing' first. Renames are executed here.
export async function buildPlan(
  ctx: ModeBase,
  lastSyncedCommit: string | null,
  force: boolean,
): Promise<PlanResult> {
  if (lastSyncedCommit === null || force) {
    return await planInitialSync(ctx);
  }
  return await planIncrementalSync(ctx, lastSyncedCommit);
}

export function mergeCounts(into: SyncRunCounts, from: SyncRunCounts): void {
  into.created += from.created;
  into.updated += from.updated;
  into.deleted += from.deleted;
  into.renamed += from.renamed;
  into.errored += from.errored;
}

// Single-shot sync: plan, process every file in one invocation, finalize. Kept
// for tests and any non-queued caller; production triggers enqueue a sync_job and
// drain it in bounded chunks (see job.ts), which is what survives a large diff
// without eviction.
export async function syncProject(
  projectId: string,
  bucket: R2Bucket,
  force = false,
): Promise<SyncRunResult> {
  const loaded = await loadSyncContext(projectId, bucket);
  if ("terminal" in loaded) return loaded.terminal;
  const { ctx, lastSyncedCommit } = loaded;

  // From here on every exit path reaches a terminal state (idle, error, or
  // rate_limited); the catch-all guarantees it even on an unexpected throw.
  await db
    .update(gitSources)
    .set({ syncStatus: "syncing", updatedAt: new Date() })
    .where(eq(gitSources.id, ctx.gitSourceId));

  try {
    const planned = await buildPlan(ctx, lastSyncedCommit, force);
    if (planned.kind === "terminal") return planned.result;
    const plan = planned.plan;
    // Atomic gate: validate every changed file first; if any is broken, write
    // nothing and leave lastSyncedCommit so the next push re-validates the set.
    await validatePlanBatch(ctx, plan, plan.processedSeed);
    const errorCount = await planErrorCount(ctx.projectId, plan.processedSeed);
    if (errorCount > 0) {
      return await markError(ctx.gitSourceId, atomicGateMessage(errorCount), ZERO_COUNTS);
    }
    const counts: SyncRunCounts = { ...ZERO_COUNTS, renamed: plan.renamedCount };
    const changedPaths: string[] = [];
    const batch = await processPlanBatch(ctx, plan, plan.pending);
    mergeCounts(counts, batch.counts);
    changedPaths.push(...batch.changedPaths);
    return await finalizePlan(ctx, plan, counts, changedPaths);
  } catch (err) {
    // Keep syncError generic (it reaches the project owner via the dashboard API);
    // the full detail goes to the Workers log only.
    const detail = err instanceof Error ? err.message : String(err);
    console.error("sync failed unexpectedly", {
      projectId: ctx.projectId,
      gitSourceId: ctx.gitSourceId,
      detail,
    });
    return await markError(
      ctx.gitSourceId,
      "The sync failed unexpectedly. Try resyncing, and report it if it keeps happening.",
      ZERO_COUNTS,
    );
  }
}

// ---------- modes ----------

export interface ModeBase {
  bucket: R2Bucket;
  forge: Forge;
  repoUrl: string;
  projectId: string;
  projectSlug: string;
  orgSlug: string;
  gitSourceId: string;
  branch: string;
  subpath: string | null;
}

async function planInitialSync(ctx: ModeBase): Promise<PlanResult> {
  const tree = await ctx.forge.fetchTree(ctx.branch);
  if (!tree.ok) {
    return {
      kind: "terminal",
      result: await handleGitHubFailure(ctx.gitSourceId, tree, ZERO_COUNTS),
    };
  }

  const resolvedSha = tree.value.sha;
  const blobPaths = tree.value.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path);

  // Mintlify repos convert per-file and take their sidebar from the config's nav;
  // a docolin repo uses the doco_sitemap.yaml cascade.
  const mintlify = await resolveMintlify(ctx, resolvedSha, blobPaths);
  const ctx2: ModeBase = { ...ctx, subpath: mintlify?.subpath ?? ctx.subpath };

  const eligible: string[] = [];
  const sitemapFiles: string[] = [];
  for (const path of blobPaths) {
    if (isDocoFile(path, ctx2.subpath, mintlify !== null)) eligible.push(path);
    else if (mintlify === null && isDocoSitemapFile(path, ctx2.subpath)) sitemapFiles.push(path);
  }

  const versionTag = await resolveTagForSha(ctx.forge, resolvedSha);
  // Validate the docolin sitemap files now (records / clears their per-file
  // errors); a Mintlify nav has no source files to validate. Each drain rebuilds
  // its own resolver, so this one exists only for the validation pass.
  if (mintlify === null) {
    const resolver = makeResolver(ctx2, resolvedSha);
    await validateSitemapFiles(ctx2.projectId, resolver, sitemapFiles);
  }

  // The reconciliation sweep (live docos no longer in the tree, removed upstream)
  // and the file upserts run in the drain: processPlanBatch consumes `pending`,
  // finalizePlan sweeps against `processedSeed`.
  return {
    kind: "plan",
    plan: {
      isInitial: true,
      targetSha: resolvedSha,
      baseSha: null,
      versionTag,
      mintlify,
      pending: eligible,
      deletes: [],
      renameOlds: [],
      renamedCount: 0,
      processedSeed: eligible,
      changedSitemaps: [],
      configChanged: false,
    },
  };
}

// A per-sync sitemap resolver bound to the resolved commit. Fetches each
// doco_sitemap.yaml at most once and walks up from a doco to find the nearest.
function makeResolver(ctx: ModeBase, ref: string): SitemapResolver {
  return createSitemapResolver({
    subpath: ctx.subpath,
    fetchFile: (path) => ctx.forge.fetchFile(ref, path),
  });
}

// ---------- Mintlify detection ----------

interface MintlifyMode {
  // The docs root (may be auto-derived from the config location).
  subpath: string | null;
  // The sidebar derived from the Mintlify config's navigation, applied to every
  // doco. Null when the config has no usable navigation.
  sitemap: Sitemap | null;
  // The configured icon library (Font Awesome by default), used to prefix card
  // icon names during conversion.
  iconLibrary: MintlifyIconLibrary;
}

// Decides whether this repo is a Mintlify docs project for this sync. An initial
// sync passes the file tree (so a nested docs.json is found and its directory
// persisted as the subpath); an incremental sync passes null and the known
// subpath is probed. Returns null for a normal docolin repo.
async function resolveMintlify(
  ctx: ModeBase,
  ref: string,
  treePaths: string[] | null,
): Promise<MintlifyMode | null> {
  const configPath =
    treePaths !== null
      ? findMintlifyConfig(treePaths, ctx.subpath)
      : await findConfigByFetch(ctx, ref);
  if (configPath === null) return null;

  const docsDir = docsDirForConfig(configPath);
  const userSubpath = ctx.subpath !== null && ctx.subpath.length > 0 ? ctx.subpath : null;
  const effectiveSubpath = userSubpath ?? (docsDir.length > 0 ? docsDir : null);
  if (userSubpath === null && effectiveSubpath !== null) {
    // Persist the auto-detected docs root so later incremental syncs scope to it.
    await db
      .update(gitSources)
      .set({ subpath: effectiveSubpath, updatedAt: new Date() })
      .where(eq(gitSources.id, ctx.gitSourceId));
  }

  const fetched = await ctx.forge.fetchFile(ref, configPath);
  let sitemap: Sitemap | null = null;
  let iconLibrary: MintlifyIconLibrary = "fontawesome";
  if (fetched.ok) {
    const config = parseMintlifyConfig(fetched.content);
    if (config !== null) {
      iconLibrary = config.iconLibrary;
      const nav = navToSitemap(config.navigation, {
        orgSlug: ctx.orgSlug,
        projectSlug: ctx.projectSlug,
      });
      if (nav.length > 0) sitemap = nav;
    }
  }
  return { subpath: effectiveSubpath, sitemap, iconLibrary };
}

async function findConfigByFetch(ctx: ModeBase, ref: string): Promise<string | null> {
  for (const path of configPathsFor(ctx.subpath)) {
    const fetched = await ctx.forge.fetchFile(ref, path);
    if (fetched.ok) return path;
  }
  return null;
}

// Validates each changed/known doco_sitemap.yaml and records or clears a
// per-file sync error so an authoring mistake surfaces the same way a bad doco
// does. Reuses the resolver's cache, so the fetch is shared with resolution.
async function validateSitemapFiles(
  projectId: string,
  resolver: SitemapResolver,
  sitemapPaths: string[],
): Promise<void> {
  for (const path of sitemapPaths) {
    const res = await resolver.resultForDir(dirOf(path));
    if (res.status === "invalid") {
      await recordFileError(projectId, path, "invalid_sitemap", res.message, {});
    } else {
      await clearFileError(projectId, path);
    }
  }
}

async function planIncrementalSync(ctx: ModeBase, base: string): Promise<PlanResult> {
  const compare = await ctx.forge.fetchCompare(base, ctx.branch);
  if (!compare.ok) {
    return {
      kind: "terminal",
      result: await handleGitHubFailure(ctx.gitSourceId, compare, ZERO_COUNTS),
    };
  }

  if (compare.value.truncated) {
    // Compare endpoint capped (250 commits / 300 files). For v1 fall back
    // to error and let the operator decide; a fresh-tree fallback can come
    // later. Per sync-engine spec this is rare in practice.
    return {
      kind: "terminal",
      result: await markError(
        ctx.gitSourceId,
        "The forge's compare response was truncated. Run a full re-sync.",
        ZERO_COUNTS,
      ),
    };
  }

  const resolvedSha = compare.value.resolvedSha;

  // Detect Mintlify for this sync (probes the persisted docs subpath). Mintlify
  // takes its sidebar from the config nav; a docolin repo uses the cascade.
  const mintlify = await resolveMintlify(ctx, resolvedSha, null);
  const ctx2: ModeBase = { ...ctx, subpath: mintlify?.subpath ?? ctx.subpath };
  const allowMdx = mintlify !== null;
  const configPaths = mintlify !== null ? new Set(configPathsFor(ctx2.subpath)) : new Set<string>();

  const toProcess: string[] = [];
  const toRename: { oldPath: string; newPath: string; alsoModified: boolean }[] = [];
  const toDelete: string[] = [];
  // docolin only: changed doco_sitemap.yaml files (path -> removed?).
  const changedSitemaps = new Map<string, boolean>();
  // Mintlify only: whether the config (and so the whole nav sidebar) changed.
  let configChanged = false;

  // Files with lingering errors from a previous sync get re-processed even
  // when GitHub reports no change. This is how schema/validator fixes
  // propagate without requiring the user to push a no-op commit. Critical:
  // load BEFORE the "no-op" short-circuit below; otherwise an identical
  // compare would bail and stale errors would never clear.
  const erroredRows = await db
    .select({ filePath: syncFileErrors.filePath })
    .from(syncFileErrors)
    .where(eq(syncFileErrors.projectId, ctx2.projectId));

  for (const f of compare.value.files) {
    if (mintlify !== null && configPaths.has(f.filename)) {
      configChanged = true;
      continue;
    }
    if (mintlify === null && isDocoSitemapFile(f.filename, ctx2.subpath)) {
      changedSitemaps.set(f.filename, f.status === "removed");
      // A sitemap renamed from one doco_sitemap.yaml spot to another: the old
      // directory lost its file too.
      if (
        f.status === "renamed" &&
        f.previousFilename !== undefined &&
        isDocoSitemapFile(f.previousFilename, ctx2.subpath)
      ) {
        changedSitemaps.set(f.previousFilename, true);
      }
      continue;
    }
    if (!isDocoFile(f.filename, ctx2.subpath, allowMdx)) {
      // Renames where the old path was a doco but the new one isn't (or
      // vice versa) are edge cases; treat as delete-then-add via separate
      // entries. For v1 ignore non-doco files entirely.
      if (
        f.status === "renamed" &&
        f.previousFilename !== undefined &&
        isDocoFile(f.previousFilename, ctx2.subpath, allowMdx)
      ) {
        toDelete.push(f.previousFilename);
      }
      // A sitemap file renamed to a non-sitemap name: its directory lost its
      // sitemap, so that subtree must fall back to a parent.
      if (
        mintlify === null &&
        f.status === "renamed" &&
        f.previousFilename !== undefined &&
        isDocoSitemapFile(f.previousFilename, ctx2.subpath)
      ) {
        changedSitemaps.set(f.previousFilename, true);
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
    if (isDocoFile(filePath, ctx2.subpath, allowMdx)) {
      toProcess.push(filePath);
    } else if (mintlify === null && isDocoSitemapFile(filePath, ctx2.subpath)) {
      // Re-validate a previously-broken sitemap file even when this compare
      // didn't touch it, so a fix pushed in an unrelated commit clears the error.
      if (!changedSitemaps.has(filePath)) changedSitemaps.set(filePath, false);
    } else {
      await clearFileError(ctx2.projectId, filePath);
    }
  }

  // Now that errored files are folded in, check if there's actually anything to
  // do. Short-circuit with a lastSyncedAt touch when nothing changed (no docos,
  // no sitemap source) so the project stops bubbling to the top of the queue.
  const hasSitemapWork = mintlify !== null ? configChanged : changedSitemaps.size > 0;
  if (toProcess.length === 0 && toRename.length === 0 && toDelete.length === 0 && !hasSitemapWork) {
    await db
      .update(gitSources)
      .set({
        syncStatus: "idle",
        lastSyncedAt: new Date(),
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(gitSources.id, ctx2.gitSourceId));
    return {
      kind: "terminal",
      result: { status: "skipped_no_change", resolvedSha, counts: ZERO_COUNTS },
    };
  }

  // Renames must be processed before adds so the lookup on the OLD path finds the
  // original doco, not a freshly-inserted one at the same name. They run here at
  // plan time; the drain only carries the old paths for the finalize cache purge.
  let renamedCount = 0;
  for (const rn of toRename) {
    const result = await processFileRename(rn.oldPath, rn.newPath, ctx2.gitSourceId);
    if (result.status === "renamed") renamedCount += 1;
  }

  const versionTag = await resolveTagForSha(ctx2.forge, resolvedSha);

  // processPlanBatch consumes `pending`; finalizePlan applies `deletes` and the
  // sitemap re-resolution carried in changedSitemaps / configChanged.
  return {
    kind: "plan",
    plan: {
      isInitial: false,
      targetSha: resolvedSha,
      baseSha: base,
      versionTag,
      mintlify,
      pending: toProcess,
      deletes: toDelete,
      renameOlds: toRename.map((r) => r.oldPath),
      renamedCount,
      processedSeed: toProcess,
      changedSitemaps: [...changedSitemaps.entries()].map(([path, removed]) => ({ path, removed })),
      configChanged,
    },
  };
}

// ---------- plan execution (drain) ----------

// The effective context for a plan: the source subpath may have been overridden
// by Mintlify auto-detection at plan time and is persisted on the plan.
function planContext(ctx: ModeBase, plan: SyncPlan): ModeBase {
  return { ...ctx, subpath: plan.mintlify?.subpath ?? ctx.subpath };
}

// Rebuilds the sitemap resolver for a plan from its persisted Mintlify mode and
// target commit (the resolver/forge closures can't be serialized into the job).
// Returns the resolve function plus, for a docolin repo, the underlying resolver
// (finalize needs it to validate changed sitemap files).
function buildResolveSitemap(
  ctx2: ModeBase,
  plan: SyncPlan,
): {
  resolveSitemap: (docoPath: string) => Promise<SitemapResolution | null>;
  resolver: SitemapResolver | null;
} {
  if (plan.mintlify !== null) {
    const navSitemap = plan.mintlify.sitemap;
    const navResolution: SitemapResolution | null =
      navSitemap === null ? null : { sitemap: navSitemap, sourcePath: ctx2.subpath ?? "" };
    return { resolveSitemap: () => Promise.resolve(navResolution), resolver: null };
  }
  const resolver = makeResolver(ctx2, plan.targetSha);
  return { resolveSitemap: (path) => resolver.resolve(path), resolver };
}

// Processes one batch of a plan's pending upserts (called repeatedly by the
// drain). Rebuilds the per-file context from the plan so it works across bounded
// invocations, then reuses processFiles. Renames ran at plan time and deletes run
// at finalize, so only upserts are passed here.
export async function processPlanBatch(
  ctx: ModeBase,
  plan: SyncPlan,
  batchPaths: string[],
): Promise<{ counts: SyncRunCounts; changedPaths: string[] }> {
  const ctx2 = planContext(ctx, plan);
  const { resolveSitemap } = buildResolveSitemap(ctx2, plan);
  return await processFiles(
    batchPaths,
    [],
    [],
    ctx2,
    plan.targetSha,
    plan.versionTag,
    resolveSitemap,
    plan.mintlify !== null,
    plan.mintlify?.iconLibrary ?? "fontawesome",
  );
}

// ---------- atomic validation gate ----------

// Validates a batch of changed doco files (fetch + parse + authors, no render or
// write) and records or clears each file's error. The drain's `validating` phase
// runs this over every changed file before any version is written, so a broken
// file blocks the whole sync instead of half-publishing it.
export async function validatePlanBatch(
  ctx: ModeBase,
  plan: SyncPlan,
  paths: string[],
): Promise<void> {
  const ctx2 = planContext(ctx, plan);
  const fileCtx: ProcessFileContext = {
    bucket: ctx2.bucket,
    forge: ctx2.forge,
    repoUrl: ctx2.repoUrl,
    projectId: ctx2.projectId,
    gitSourceId: ctx2.gitSourceId,
    ref: plan.targetSha,
    versionTag: plan.versionTag,
    orgSlug: ctx2.orgSlug,
    projectSlug: ctx2.projectSlug,
    subpath: ctx2.subpath,
    mintlifyIconLibrary: plan.mintlify?.iconLibrary ?? "fontawesome",
    // validateFile never resolves the sitemap; a stub keeps the validate pass cheap.
    resolveSitemap: () => Promise.resolve(null),
    mintlify: plan.mintlify !== null,
  };
  for (const path of paths) {
    const result = await validateFile(path, fileCtx);
    if (result.ok) {
      await clearFileError(ctx2.projectId, path);
    } else {
      await recordFileError(
        ctx2.projectId,
        path,
        result.error.errorCode,
        result.error.errorMessage,
        result.error.errorDetails,
      );
    }
  }
}

// How many of the given paths currently have a recorded sync error. The atomic
// gate aborts the sync (writes nothing, leaves lastSyncedCommit) when this is
// non-zero after validating the whole changed set.
export async function planErrorCount(projectId: string, paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const rows = await db
    .select({ filePath: syncFileErrors.filePath })
    .from(syncFileErrors)
    .where(and(eq(syncFileErrors.projectId, projectId), inArray(syncFileErrors.filePath, paths)));
  return rows.length;
}

// The badge message when the atomic gate blocks a sync. Generic (it reaches the
// project owner via the dashboard); the per-file errors are listed separately.
export function atomicGateMessage(count: number): string {
  return count === 1
    ? "1 file has an error. Fix it and push again to publish your changes."
    : `${String(count)} files have errors. Fix them and push again to publish your changes.`;
}

// Runs the once-per-sync tail after every file is processed: deletions, the
// initial-sync reconciliation sweep, sitemap re-resolution for changed sidebars,
// then markIdle + cache purge. Every step is idempotent, so a retried finalize
// (after a crash) is safe. `counts` and `changedPaths` carry the accumulation
// from the processing chunks.
export async function finalizePlan(
  ctx: ModeBase,
  plan: SyncPlan,
  counts: SyncRunCounts,
  changedPaths: string[],
): Promise<SyncRunResult> {
  const ctx2 = planContext(ctx, plan);

  // Incremental deletions (removed files). Initial syncs carry none here; the
  // sweep below handles their removals.
  for (const path of plan.deletes) {
    const deletion = await processFileDelete(path, ctx2.gitSourceId);
    if (deletion.status === "deleted") {
      counts.deleted += 1;
      await clearFileError(ctx2.projectId, path);
      changedPaths.push(path);
    }
  }

  // Initial / forced reconciliation sweep: any live doco whose source file is no
  // longer in the tree was removed (or moved) upstream and must be tombstoned.
  if (plan.isInitial) {
    const present = new Set(plan.processedSeed);
    const liveRows = await db
      .select({ pathInSource: docos.pathInSource })
      .from(docos)
      .where(and(eq(docos.gitSourceId, ctx2.gitSourceId), isNull(docos.deletedAt)));
    for (const row of liveRows) {
      if (row.pathInSource === null || present.has(row.pathInSource)) continue;
      const deletion = await processFileDelete(row.pathInSource, ctx2.gitSourceId);
      if (deletion.status === "deleted") {
        counts.deleted += 1;
        await clearFileError(ctx2.projectId, row.pathInSource);
        changedPaths.push(row.pathInSource);
      }
    }
  }

  // Sitemap subtree re-resolution (incremental only): a changed sidebar source
  // updates the affected docos in place, skipping those just re-processed.
  let sitemapTouched: string[] = [];
  const { resolveSitemap, resolver } = buildResolveSitemap(ctx2, plan);
  const skip = new Set(plan.processedSeed);
  if (plan.mintlify !== null) {
    if (plan.configChanged) {
      sitemapTouched = await reresolveAffectedDocos(
        ctx2,
        resolveSitemap,
        new Set([""]),
        skip,
        plan.targetSha,
        true,
      );
    }
  } else if (plan.changedSitemaps.length > 0 && resolver !== null) {
    await validateSitemapFiles(
      ctx2.projectId,
      resolver,
      plan.changedSitemaps.filter((s) => !s.removed).map((s) => s.path),
    );
    for (const s of plan.changedSitemaps) {
      if (s.removed) await clearFileError(ctx2.projectId, s.path);
    }
    sitemapTouched = await reresolveAffectedDocos(
      ctx2,
      resolveSitemap,
      new Set(plan.changedSitemaps.map((s) => dirOf(s.path))),
      skip,
      plan.targetSha,
      false,
    );
  }

  const result = await markIdle(ctx2.gitSourceId, plan.targetSha, counts);
  await purgeChangedDocos(ctx2, [...changedPaths, ...plan.renameOlds, ...sitemapTouched]);
  return result;
}

// Looks up a tag name pointing at the resolved commit, if one exists. Returns
// null on tag fetch failure: tag display is a nice-to-have, never block a
// sync over it. First matching tag wins when multiple point at the same
// commit (rare; can refine later if a real repo needs deterministic picks).
async function resolveTagForSha(forge: Forge, sha: string): Promise<string | null> {
  const tags = await forge.fetchTags();
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
  resolveSitemap: (docoPath: string) => Promise<SitemapResolution | null>,
  mintlify: boolean,
  mintlifyIconLibrary: MintlifyIconLibrary,
): Promise<{ counts: SyncRunCounts; changedPaths: string[] }> {
  const counts: SyncRunCounts = { ...ZERO_COUNTS };
  // Source paths whose latest URL is now stale. Drives the cache purge. Errored
  // files are excluded (no new version was published, so the cached HTML still
  // matches what's in the DB).
  const changedPaths: string[] = [];

  const fileCtx: ProcessFileContext = {
    bucket: ctx.bucket,
    forge: ctx.forge,
    repoUrl: ctx.repoUrl,
    projectId: ctx.projectId,
    gitSourceId: ctx.gitSourceId,
    ref: resolvedSha,
    versionTag,
    orgSlug: ctx.orgSlug,
    projectSlug: ctx.projectSlug,
    subpath: ctx.subpath,
    mintlifyIconLibrary,
    resolveSitemap,
    mintlify,
  };

  for (const path of toProcess) {
    const result = await processFile(path, fileCtx);
    const published = await applyFileResult(ctx.projectId, path, result, counts);
    if (published) changedPaths.push(path);
  }

  for (const path of toDelete) {
    const result = await processFileDelete(path, ctx.gitSourceId);
    if (result.status === "deleted") {
      counts.deleted += 1;
      await clearFileError(ctx.projectId, path);
      changedPaths.push(path);
    }
  }

  return { counts, changedPaths };
}

async function applyFileResult(
  projectId: string,
  filePath: string,
  result: ProcessFileResult,
  counts: SyncRunCounts,
): Promise<boolean> {
  if (result.status === "errored") {
    counts.errored += 1;
    await recordFileError(
      projectId,
      filePath,
      result.errorCode,
      result.errorMessage,
      result.errorDetails,
    );
    return false;
  }
  if (result.status === "created") counts.created += 1;
  if (result.status === "updated") counts.updated += 1;
  await clearFileError(projectId, filePath);
  return true;
}

// ---------- sitemap subtree re-resolution ----------

// When a doco_sitemap.yaml is added, edited, or removed, every doco under its
// directory might now resolve to a different sidebar. Re-resolve each (the
// resolver handles nearest-wins, so nested overrides are respected) and update
// the ones whose sidebar actually changed, in place on the latest version. No
// new version is created: the doco's content did not change, only its sidebar.
// Returns the source paths whose sidebar changed, for cache purging. Docos
// already re-processed this run (`skip`) are left alone; they got a fresh
// resolution with their new version row.
async function reresolveAffectedDocos(
  ctx: ModeBase,
  resolveSitemap: (docoPath: string) => Promise<SitemapResolution | null>,
  dirs: Set<string>,
  skip: Set<string>,
  resolvedSha: string,
  allowMdx: boolean,
): Promise<string[]> {
  const changed: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    const rows = await db
      .select({
        docoId: docos.id,
        path: docos.pathInSource,
        sitemap: versions.sitemap,
      })
      .from(docos)
      .innerJoin(versions, and(eq(versions.docoId, docos.id), eq(versions.isLatest, true)))
      .where(
        and(
          eq(docos.projectId, ctx.projectId),
          isNull(docos.deletedAt),
          // Every doco below the changed sitemap's directory. dir === "" (repo
          // root, no subpath) governs the whole project, so no prefix filter.
          dir.length === 0 ? undefined : like(docos.pathInSource, `${dir}/%`),
        ),
      );
    for (const row of rows) {
      if (row.path === null || skip.has(row.path) || seen.has(row.path)) continue;
      seen.add(row.path);
      const resolution = await resolveSitemap(row.path);
      // Resolve sitemap urls the same way processFile does, so the stored form
      // (and this equality check) match instead of drifting to raw urls.
      const resolved =
        resolution === null
          ? null
          : resolveSitemapLinks(resolution.sitemap, {
              docoPath: resolution.sourcePath,
              subpath: ctx.subpath,
              allowMdx,
              websiteBase: `/${ctx.orgSlug}/${ctx.projectSlug}`,
              forge: { kind: "repo", repoUrl: ctx.repoUrl, ref: { commit: resolvedSha } },
            });
      if (!sitemapEqual(resolved, row.sitemap as Sitemap | null)) {
        await updateLatestVersionSitemap(row.docoId, resolved);
        changed.push(row.path);
      }
    }
  }
  return changed;
}

async function updateLatestVersionSitemap(docoId: string, sitemap: Sitemap | null): Promise<void> {
  await db
    .update(versions)
    .set({ sitemap })
    .where(and(eq(versions.docoId, docoId), eq(versions.isLatest, true)));
}

// Structural equality for two resolved sitemaps. Both come from ordered sources
// (YAML document order, or the stored JSON), so a stable stringify compares them.
function sitemapEqual(a: Sitemap | null, b: Sitemap | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- cache invalidation ----------

// Translate source paths into latest-URL purge targets and fire the CF purge.
// Best-effort: the underlying call swallows network / API failures so a flaky
// purge can't crash a successful sync (the doco viewer's stale-while-revalidate
// covers any missed invalidation).
async function purgeChangedDocos(ctx: ModeBase, changedPaths: string[]): Promise<void> {
  if (changedPaths.length === 0) return;
  const urls: string[] = [];
  for (const sourcePath of changedPaths) {
    const pathFromProjectRoot = pathFromSourcePath(sourcePath, ctx.subpath);
    for (const url of publicLatestUrls({
      orgSlug: ctx.orgSlug,
      projectSlug: ctx.projectSlug,
      pathFromProjectRoot,
    })) {
      urls.push(url);
    }
  }
  await purgeCacheUrls(urls);
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

export async function markError(
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
