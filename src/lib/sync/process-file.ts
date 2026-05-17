import { and, eq, sql } from "drizzle-orm";
import type { R2Bucket } from "@cloudflare/workers-types";
import { db } from "$lib/server/db";
import { docos, versions } from "$lib/server/db/schema";
import { toLtree } from "$lib/server/db/schema/types";
import { fetchFileFromJsDelivr } from "$lib/git/jsdelivr";
import { parseDocoFile, type ParsedDoco } from "./parse";
import { convertBody } from "./body-pipeline";
import { makeImageArchiver, type SyncFileErrorRecord } from "./media-archive";
import { resolveDocoSitemap, type GlobalSitemapResult } from "./sitemap";
import { resolveRelativePath } from "./path-resolve";
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
  globalSitemap: GlobalSitemapResult;
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

  // 2. Parse + validate frontmatter (also resolves author handles to userIds).
  const parseResult = await parseDocoFile(fetched.content);
  if (!parseResult.ok) {
    return {
      status: "errored",
      errorCode: parseResult.error.code,
      errorMessage: parseResult.error.message,
      errorDetails: parseResult.error.details,
    };
  }
  const parsed = parseResult.parsed;

  // 3. Convert the body. Image archival errors get collected here; they don't
  // fail the file since the markdown still renders with the source URL.
  const assetErrors: SyncFileErrorRecord[] = [];
  const imageArchiver = makeImageArchiver({
    bucket: ctx.bucket,
    projectId: ctx.projectId,
    owner: ctx.owner,
    repo: ctx.repo,
    ref: ctx.ref,
    docoPath: filePath,
    onError: (err) => assetErrors.push(err),
  });
  const linkRewriter = makeLinkRewriter(filePath, ctx.orgSlug, ctx.projectSlug);
  const convertedBody = await convertBody(parsed.body, {
    rewriteImageUrl: imageArchiver,
    rewriteRelativeLink: linkRewriter,
  });

  // 4. Resolve which sitemap applies to this doco (per-doco override or global).
  const sitemap = resolveDocoSitemap(parsed.frontmatter.docolin.sitemap, ctx.globalSitemap);

  // 5. Find or create the doco row, then write the version.
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
    // Find the next version number. Could also `MAX(version_number) + 1`, but
    // the unique index on (doco_id, version_number) means an explicit count
    // is simpler than racing with concurrent writes for now.
    const [{ next }] = await tx
      .select({ next: sql<number>`COALESCE(MAX(${versions.versionNumber}), 0) + 1` })
      .from(versions)
      .where(eq(versions.docoId, docoId));

    const versionId = await insertVersionRow(
      tx,
      docoId,
      next,
      ctx.ref,
      ctx.versionTag,
      parsed,
      convertedBody,
      sitemap,
    );

    await tx
      .update(docos)
      .set({
        latestPublishedVersionId: versionId,
        deletedAt: null, // un-delete if the file reappeared
        updatedAt: new Date(),
      })
      .where(eq(docos.id, docoId));

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

function makeLinkRewriter(
  docoPath: string,
  orgSlug: string,
  projectSlug: string,
): (sourceUrl: string) => string {
  return (sourceUrl: string) => {
    // body-pipeline.ts only calls this for relative `.md` links already.
    // Strip the extension and rewrite to the canonical docolin URL.
    const resolved = resolveRelativePath(docoPath, sourceUrl);
    const withoutExt = resolved.endsWith(".md") ? resolved.slice(0, -3) : resolved;
    return `/${orgSlug}/${projectSlug}/${withoutExt}`;
  };
}
