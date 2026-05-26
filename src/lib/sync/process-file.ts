import { and, eq, sql } from "drizzle-orm";
import type { R2Bucket } from "@cloudflare/workers-types";
import { db } from "$lib/server/db";
import { docos, versions } from "$lib/server/db/schema";
import { toLtree } from "$lib/server/db/schema/types";
import { fetchFileFromJsDelivr } from "$lib/git/jsdelivr";
import { parseDocoFile, type ParsedDoco } from "./parse";
import { convertBody } from "./body-pipeline";
import { makeImageArchiver, type SyncFileErrorRecord } from "./media-archive";
import { resolveDocoSitemap } from "./sitemap";
import { mintlifyMdxToDocoSource, hasDocolinFrontmatter } from "./mintlify/convert";
import type { MintlifyIconLibrary } from "./mintlify/detect";
import { resolveRelativePath } from "./path-resolve";
import { pathFromSourcePath } from "$lib/doco-urls";
import type { Sitemap } from "./sitemap-schema";

// Per-file processing for a single doco. Called by the sync orchestrator for
// each added/modified file from the GitHub compare response (incremental
// sync) or each .md file from the tree (initial sync).
//
// Always writes a new version row when called: the orchestrator already
// filters to files GitHub reported as changed, so content-equality dedup is
// rarely useful in practice. Skipping it keeps this module shorter.

export interface ProcessFileContext {
  bucket: R2Bucket;
  projectId: string;
  gitSourceId: string;
  owner: string;
  repo: string;
  ref: string;
  // Tag name pointing at `ref`, if any. Used as the display label for
  // versions; falls back to the short SHA when null.
  versionTag: string | null;
  orgSlug: string;
  projectSlug: string;
  // The git source's docs subpath (e.g. "docs"), stripped from URLs. Needed so
  // relative links resolve to the same path-from-project-root the viewer serves.
  subpath: string | null;
  // Resolves the cascade sitemap (nearest doco_sitemap.yaml) for a doco by its
  // source path. The per-doco frontmatter override is applied on top below. For
  // a Mintlify project this returns the nav-derived sidebar for every file.
  resolveSitemap: (docoPath: string) => Promise<Sitemap | null>;
  // When true, the file is a Mintlify `.mdx`: its body is converted to docomd
  // before parsing, and the maintainer must supply the docolin frontmatter.
  mintlify: boolean;
  // The Mintlify project's icon library; card icon names are rewritten with its
  // set prefix. Ignored when `mintlify` is false.
  mintlifyIconLibrary: MintlifyIconLibrary;
}

export type ProcessFileResult =
  | { status: "created" | "updated"; docoId: string; versionId: string }
  | {
      status: "errored";
      errorCode: string;
      errorMessage: string;
      errorDetails: Record<string, unknown>;
    };

export async function processFile(
  filePath: string,
  ctx: ProcessFileContext,
): Promise<ProcessFileResult> {
  // 1. Fetch the file content from jsDelivr.
  const fetched = await fetchFileFromJsDelivr({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: ctx.ref,
    path: filePath,
  });
  if (!fetched.ok) {
    return {
      status: "errored",
      errorCode: "fetch_failed",
      errorMessage: `Could not fetch ${filePath} from jsDelivr: ${fetched.message}`,
      errorDetails: { reason: fetched.reason },
    };
  }

  // 2. For a Mintlify import, convert the MDX body to docomd and keep the
  // maintainer's frontmatter; everything downstream treats it as a docolin file.
  const source = ctx.mintlify
    ? mintlifyMdxToDocoSource(fetched.content, ctx.mintlifyIconLibrary)
    : fetched.content;

  // 3. Parse + validate frontmatter (also resolves author handles to userIds).
  const parseResult = await parseDocoFile(source);
  if (!parseResult.ok) {
    // A Mintlify page that hasn't had docolin frontmatter added yet: tell the
    // maintainer exactly what to add instead of dumping a raw schema error.
    if (ctx.mintlify && !hasDocolinFrontmatter(fetched.content)) {
      return {
        status: "errored",
        errorCode: "mintlify_frontmatter_required",
        errorMessage:
          "Imported from Mintlify. Add docolin frontmatter to this page: an `authors` list (at least one) and a `docolin:` block with `kind` and `type`.",
        errorDetails: { underlying: parseResult.error.code },
      };
    }
    return {
      status: "errored",
      errorCode: parseResult.error.code,
      errorMessage: parseResult.error.message,
      errorDetails: parseResult.error.details,
    };
  }
  const parsed = parseResult.parsed;

  // 4. Convert the body. Image archival errors get collected here; they don't
  // fail the file since the markdown still renders with the source URL.
  const assetErrors: SyncFileErrorRecord[] = [];
  const imageArchiver = makeImageArchiver({
    bucket: ctx.bucket,
    projectId: ctx.projectId,
    owner: ctx.owner,
    repo: ctx.repo,
    ref: ctx.ref,
    docoPath: filePath,
    // Mintlify authors `/images/x` relative to the docs root, not the repo root.
    absoluteBase: ctx.mintlify ? ctx.subpath : null,
    onError: (err) => assetErrors.push(err),
  });
  const linkRewriter = makeLinkRewriter(filePath, ctx.orgSlug, ctx.projectSlug, ctx.subpath);
  const convertedBody = await convertBody(parsed.body, {
    rewriteImageUrl: imageArchiver,
    rewriteRelativeLink: linkRewriter,
    // Mintlify links are root-absolute to the docs root (`/devtools/mcp`); map
    // them to this project's URL space. docolin repos leave `/` links alone.
    rewriteAbsoluteLink: ctx.mintlify
      ? (url) =>
          `/${ctx.orgSlug}/${ctx.projectSlug}/${pathFromSourcePath(url.startsWith("/") ? url.slice(1) : url, null)}`
      : undefined,
  });

  // 5. Resolve which sitemap applies to this doco: the nearest doco_sitemap.yaml
  // walking up from this file, unless the doco's frontmatter overrides it.
  const cascade = await ctx.resolveSitemap(filePath);
  const sitemap = resolveDocoSitemap(parsed.frontmatter.docolin.sitemap, cascade);

  // 6. Find or create the doco row, then write the version.
  const existing = await db
    .select()
    .from(docos)
    .where(and(eq(docos.gitSourceId, ctx.gitSourceId), eq(docos.pathInSource, filePath)))
    .limit(1);

  if (existing.length === 0) {
    return await createDocoAndFirstVersion(filePath, parsed, convertedBody, sitemap, ctx);
  }
  return await addVersionToExistingDoco(existing[0].id, parsed, convertedBody, sitemap, ctx);
}

// Per-file rename: doco identity follows the file path. Only updates the
// `path_in_source` pointer; if content also changed in the same commit, the
// orchestrator calls processFile separately to insert a new version row.
export async function processFileRename(
  oldPath: string,
  newPath: string,
  gitSourceId: string,
): Promise<{ status: "renamed" | "not_found" }> {
  const result = await db
    .update(docos)
    .set({ pathInSource: newPath, updatedAt: new Date() })
    .where(and(eq(docos.gitSourceId, gitSourceId), eq(docos.pathInSource, oldPath)))
    .returning({ id: docos.id });
  return { status: result.length === 0 ? "not_found" : "renamed" };
}

// Per-file deletion: mark the doco as deleted. Version rows stay; the renderer
// surfaces `deleted_at` as a badge but the content is still accessible.
export async function processFileDelete(
  filePath: string,
  gitSourceId: string,
): Promise<{ status: "deleted" | "not_found" }> {
  const result = await db
    .update(docos)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(docos.gitSourceId, gitSourceId), eq(docos.pathInSource, filePath)))
    .returning({ id: docos.id });
  return { status: result.length === 0 ? "not_found" : "deleted" };
}

// --- helpers ---

// Flags exactly the just-published version as the doco's latest, in the same
// transaction that moves latest_published_version_id. The partial search indexes
// (WHERE is_latest) depend on this staying in sync, so set is_latest here rather
// than via a DB trigger.
async function markLatestVersion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  docoId: string,
  versionId: string,
): Promise<void> {
  await tx
    .update(versions)
    .set({ isLatest: sql`${versions.id} = ${versionId}` })
    .where(eq(versions.docoId, docoId));
}

async function createDocoAndFirstVersion(
  filePath: string,
  parsed: ParsedDoco,
  convertedBody: string,
  sitemap: Sitemap | null,
  ctx: ProcessFileContext,
): Promise<ProcessFileResult> {
  return await db.transaction(async (tx) => {
    const [docoRow] = await tx
      .insert(docos)
      .values({
        projectId: ctx.projectId,
        gitSourceId: ctx.gitSourceId,
        pathInSource: filePath,
      })
      .returning({ id: docos.id });

    const versionId = await insertVersionRow(
      tx,
      docoRow.id,
      1,
      ctx.ref,
      ctx.versionTag,
      parsed,
      convertedBody,
      sitemap,
    );

    await tx
      .update(docos)
      .set({ latestPublishedVersionId: versionId, updatedAt: new Date() })
      .where(eq(docos.id, docoRow.id));

    await markLatestVersion(tx, docoRow.id, versionId);

    return { status: "created", docoId: docoRow.id, versionId };
  });
}

async function addVersionToExistingDoco(
  docoId: string,
  parsed: ParsedDoco,
  convertedBody: string,
  sitemap: Sitemap | null,
  ctx: ProcessFileContext,
): Promise<ProcessFileResult> {
  return await db.transaction(async (tx) => {
    // Re-syncing the same commit updates that commit's version in place rather
    // than stacking a duplicate version row with the same SHA. This keeps a
    // commit mapped to exactly one version (so `@sha` lookups stay
    // unambiguous), makes dev force-resyncs idempotent, and preserves the
    // version's id, so stamps and the Pango Score stay attached across a
    // re-process instead of orphaning onto a dead row.
    const existing = await tx
      .select({ id: versions.id })
      .from(versions)
      .where(and(eq(versions.docoId, docoId), eq(versions.commitSha, ctx.ref)))
      .limit(1);

    let versionId: string;
    if (existing.length > 0) {
      versionId = existing[0].id;
      await updateVersionRow(tx, versionId, ctx.versionTag, parsed, convertedBody, sitemap);
    } else {
      // Explicit count rather than racing; the unique (doco_id, version_number)
      // index protects against a concurrent writer.
      const [{ next }] = await tx
        .select({ next: sql<number>`COALESCE(MAX(${versions.versionNumber}), 0) + 1` })
        .from(versions)
        .where(eq(versions.docoId, docoId));
      versionId = await insertVersionRow(
        tx,
        docoId,
        next,
        ctx.ref,
        ctx.versionTag,
        parsed,
        convertedBody,
        sitemap,
      );
    }

    await tx
      .update(docos)
      .set({
        latestPublishedVersionId: versionId,
        deletedAt: null, // un-delete if the file reappeared
        updatedAt: new Date(),
      })
      .where(eq(docos.id, docoId));

    await markLatestVersion(tx, docoId, versionId);

    return { status: "updated", docoId, versionId };
  });
}

async function insertVersionRow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  docoId: string,
  versionNumber: number,
  commitSha: string,
  versionTag: string | null,
  parsed: ParsedDoco,
  convertedBody: string,
  sitemap: Sitemap | null,
): Promise<string> {
  const fm = parsed.frontmatter;
  const doc = fm.docolin;
  const timeEstimate = parsed.timeEstimate;

  const [row] = await tx
    .insert(versions)
    .values({
      docoId,
      versionNumber,
      commitSha,
      versionTag,
      kind: toLtree(doc.kind),
      type: doc.type,
      title: fm.title,
      description: fm.description ?? null,
      appliesTo: doc.applies_to,
      status: doc.status,
      language: doc.language,
      difficulty: doc.difficulty ?? null,
      timeEstimateMinMinutes: timeEstimate === null ? null : timeEstimate.minMinutes,
      timeEstimateMaxMinutes: timeEstimate === null ? null : timeEstimate.maxMinutes,
      aliases: doc.aliases,
      prevLink: doc.prev ?? null,
      nextLink: doc.next ?? null,
      supersededBy: doc.superseded_by ?? null,
      references: doc.references,
      authors: parsed.authors,
      sitemap,
      bodyText: convertedBody,
      bodyFormat: "commonmark",
    })
    .returning({ id: versions.id });

  return row.id;
}

// Re-process an existing version's content in place: same id, versionNumber,
// commitSha, publishedAt, and verification aggregate; only the synced content
// and frontmatter-derived fields change. Mirrors insertVersionRow's field set.
async function updateVersionRow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  versionId: string,
  versionTag: string | null,
  parsed: ParsedDoco,
  convertedBody: string,
  sitemap: Sitemap | null,
): Promise<void> {
  const fm = parsed.frontmatter;
  const doc = fm.docolin;
  const timeEstimate = parsed.timeEstimate;

  await tx
    .update(versions)
    .set({
      versionTag,
      kind: toLtree(doc.kind),
      type: doc.type,
      title: fm.title,
      description: fm.description ?? null,
      appliesTo: doc.applies_to,
      status: doc.status,
      language: doc.language,
      difficulty: doc.difficulty ?? null,
      timeEstimateMinMinutes: timeEstimate === null ? null : timeEstimate.minMinutes,
      timeEstimateMaxMinutes: timeEstimate === null ? null : timeEstimate.maxMinutes,
      aliases: doc.aliases,
      prevLink: doc.prev ?? null,
      nextLink: doc.next ?? null,
      supersededBy: doc.superseded_by ?? null,
      references: doc.references,
      authors: parsed.authors,
      sitemap,
      bodyText: convertedBody,
      bodyFormat: "commonmark",
    })
    .where(eq(versions.id, versionId));
}

function makeLinkRewriter(
  docoPath: string,
  orgSlug: string,
  projectSlug: string,
  subpath: string | null,
): (sourceUrl: string) => string {
  return (sourceUrl: string) => {
    // body-pipeline.ts only calls this for relative `.md` links already. Resolve
    // against the doco's file path, then map to the public path-from-project-root,
    // which drops the docs subpath (e.g. "docs/") and the ".md", matching the URL
    // the viewer serves. Without the subpath strip, links 404 under /…/docs/….
    const resolved = resolveRelativePath(docoPath, sourceUrl);
    const pathFromRoot = pathFromSourcePath(resolved, subpath);
    return `/${orgSlug}/${projectSlug}/${pathFromRoot}`;
  };
}
