import { and, eq, isNull, like } from "drizzle-orm";
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

const ZERO_COUNTS: SyncRunCounts = {
  created: 0,
  updated: 0,
  deleted: 0,
  renamed: 0,
  errored: 0,
};

export async function syncProject(
  projectId: string,
  bucket: R2Bucket,
  force = false,
): Promise<SyncRunResult> {
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

  if (!isForgeProvider(r.provider)) {
    return await markError(
      r.gitSourceId,
      `Provider ${r.provider} is not supported yet`,
      ZERO_COUNTS,
    );
  }

  const parsed = parseForgeRepoUrl(r.provider, r.repoUrl);
  if (parsed === null) {
    return await markError(
      r.gitSourceId,
      `Could not parse repo URL for provider ${r.provider}: ${r.repoUrl}`,
      ZERO_COUNTS,
    );
  }
  const forge = forgeFor(r.provider, parsed.owner, parsed.repo);

  // Mark syncing. From here on, every exit path either transitions to idle
  // (success / no-change), error (unrecoverable), or rate_limited (defer).
  await db
    .update(gitSources)
    .set({ syncStatus: "syncing", updatedAt: new Date() })
    .where(eq(gitSources.id, r.gitSourceId));

  // A forced run (dev-mode manual resync) re-processes the whole tree even when
  // HEAD hasn't moved, so renderer / pipeline changes take effect without pushing
  // a no-op commit.
  if (r.lastSyncedCommit === null || force) {
    return await runInitialSync({
      bucket,
      forge,
      repoUrl: r.repoUrl,
      projectId: r.projectId,
      projectSlug: r.projectSlug,
      orgSlug: r.orgSlug,
      gitSourceId: r.gitSourceId,
      branch: r.defaultBranch,
      subpath: r.subpath,
    });
  }
  return await runIncrementalSync({
    bucket,
    forge,
    repoUrl: r.repoUrl,
    projectId: r.projectId,
    projectSlug: r.projectSlug,
    orgSlug: r.orgSlug,
    gitSourceId: r.gitSourceId,
    branch: r.defaultBranch,
    subpath: r.subpath,
    base: r.lastSyncedCommit,
  });
}

// ---------- modes ----------

interface ModeBase {
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

async function runInitialSync(ctx: ModeBase): Promise<SyncRunResult> {
  const tree = await ctx.forge.fetchTree(ctx.branch);
  if (!tree.ok) return await handleGitHubFailure(ctx.gitSourceId, tree, ZERO_COUNTS);

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
  let resolveSitemap: (docoPath: string) => Promise<SitemapResolution | null>;
  if (mintlify !== null) {
    const navSitemap = mintlify.sitemap;
    // The Mintlify nav has no source file and its urls are already absolute, so
    // the base is irrelevant; anchor it at the docs root.
    const navResolution: SitemapResolution | null =
      navSitemap === null ? null : { sitemap: navSitemap, sourcePath: ctx2.subpath ?? "" };
    resolveSitemap = () => Promise.resolve(navResolution);
  } else {
    const resolver = makeResolver(ctx2, resolvedSha);
    await validateSitemapFiles(ctx2.projectId, resolver, sitemapFiles);
    resolveSitemap = (path) => resolver.resolve(path);
  }

  const { counts, changedPaths } = await processFiles(
    eligible,
    [],
    [],
    ctx2,
    resolvedSha,
    versionTag,
    resolveSitemap,
    mintlify !== null,
    mintlify?.iconLibrary ?? "fontawesome",
  );

  // A full sync is a reconciliation, not just an upsert: any live doco whose
  // source file is no longer in the tree was removed (or moved) upstream and
  // must be marked deleted here too. Incremental syncs learn deletions from
  // the compare diff; this path (first sync, forced re-sync, the fallback
  // after a truncated compare) only knows what IS present, so it sweeps the
  // difference. Without this, a forced re-sync silently kept deleted docos
  // alive forever.
  const present = new Set(eligible);
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

  const result = await markIdle(ctx2.gitSourceId, resolvedSha, counts);
  await purgeChangedDocos(ctx2, changedPaths);
  return result;
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

async function runIncrementalSync(ctx: ModeBase & { base: string }): Promise<SyncRunResult> {
  const compare = await ctx.forge.fetchCompare(ctx.base, ctx.branch);
  if (!compare.ok) return await handleGitHubFailure(ctx.gitSourceId, compare, ZERO_COUNTS);

  if (compare.value.truncated) {
    // Compare endpoint capped (250 commits / 300 files). For v1 fall back
    // to error and let the operator decide; a fresh-tree fallback can come
    // later. Per sync-engine spec this is rare in practice.
    return await markError(
      ctx.gitSourceId,
      "The forge's compare response was truncated. Run a full re-sync.",
      ZERO_COUNTS,
    );
  }

  const resolvedSha = compare.value.resolvedSha;

  // Detect Mintlify for this sync (probes the persisted docs subpath). Mintlify
  // takes its sidebar from the config nav; a docolin repo uses the cascade.
  const mintlify = await resolveMintlify(ctx, resolvedSha, null);
  const ctx2: ModeBase & { base: string } = { ...ctx, subpath: mintlify?.subpath ?? ctx.subpath };
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
      status: "skipped_no_change",
      resolvedSha,
      counts: ZERO_COUNTS,
    };
  }

  // Renames must be processed before adds so the lookup on the OLD path
  // finds the original doco, not a freshly-inserted one at the same name.
  const renameCounts = { renamed: 0 };
  for (const rn of toRename) {
    const result = await processFileRename(rn.oldPath, rn.newPath, ctx2.gitSourceId);
    if (result.status === "renamed") renameCounts.renamed += 1;
  }

  // Sitemap source: the nav (a constant) for Mintlify; the doco_sitemap.yaml
  // cascade resolver otherwise.
  let resolveSitemap: (docoPath: string) => Promise<SitemapResolution | null>;
  let resolver: SitemapResolver | null = null;
  if (mintlify !== null) {
    const navSitemap = mintlify.sitemap;
    const navResolution: SitemapResolution | null =
      navSitemap === null ? null : { sitemap: navSitemap, sourcePath: ctx2.subpath ?? "" };
    resolveSitemap = () => Promise.resolve(navResolution);
  } else {
    const r = makeResolver(ctx2, resolvedSha);
    resolver = r;
    resolveSitemap = (path) => r.resolve(path);
  }

  const versionTag = await resolveTagForSha(ctx2.forge, resolvedSha);
  const { counts, changedPaths } = await processFiles(
    toProcess,
    toRename,
    toDelete,
    ctx2,
    resolvedSha,
    versionTag,
    resolveSitemap,
    mintlify !== null,
    mintlify?.iconLibrary ?? "fontawesome",
  );
  counts.renamed = renameCounts.renamed;

  let sitemapTouched: string[] = [];
  if (mintlify !== null) {
    // A changed Mintlify config means the whole sidebar changed: re-apply the new
    // nav to every doco (skipping those just re-processed with it).
    if (configChanged) {
      sitemapTouched = await reresolveAffectedDocos(
        ctx2,
        resolveSitemap,
        new Set([""]),
        new Set(toProcess),
        resolvedSha,
        true,
      );
    }
  } else if (resolver !== null) {
    // Changed doco_sitemap.yaml files: validate (surface authoring errors), then
    // re-resolve the subtrees they govern so existing docos pick up the new
    // sidebar without needing a content change.
    await validateSitemapFiles(
      ctx2.projectId,
      resolver,
      [...changedSitemaps.entries()].filter(([, removed]) => !removed).map(([path]) => path),
    );
    for (const [path, removed] of changedSitemaps) {
      if (removed) await clearFileError(ctx2.projectId, path);
    }
    sitemapTouched = await reresolveAffectedDocos(
      ctx2,
      resolveSitemap,
      new Set([...changedSitemaps.keys()].map(dirOf)),
      new Set(toProcess),
      resolvedSha,
      false,
    );
  }

  // Renames also invalidate the OLD URL: it used to serve the doco, now it's a
  // 404 (or whatever replaced it). The new path is already in changedPaths via
  // toProcess (renames are always paired with a process call in the loop above).
  const renameOldPaths = toRename.map((r) => r.oldPath);
  const result = await markIdle(ctx2.gitSourceId, resolvedSha, counts);
  await purgeChangedDocos(ctx2, [...changedPaths, ...renameOldPaths, ...sitemapTouched]);
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
