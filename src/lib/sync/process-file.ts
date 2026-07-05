import { and, eq, sql } from "drizzle-orm";
import type { R2Bucket } from "@cloudflare/workers-types";
import { db } from "$lib/server/db";
import { docos, versions } from "$lib/server/db/schema";
import { toLtree } from "$lib/server/db/schema/types";
import type { Forge } from "$lib/git/forge";
import { isOptOutReadme } from "./file-scope";
import { parseDocoFile, type ParsedDoco, type StoredAuthor } from "./parse";
import { resolveStoredAuthors } from "./resolve-authors";
import { convertBody } from "./body-pipeline";
import { makeImageArchiver, type SyncFileErrorRecord } from "./media-archive";
import { resolveDocoSitemap, type SitemapResolution } from "./sitemap";
import { mintlifyMdxToDocoSource, hasDocolinFrontmatter } from "./mintlify/convert";
import type { MintlifyIconLibrary } from "./mintlify/detect";
import { resolveLink, resolveSitemapLinks, type LinkResolveContext } from "$lib/doco/resolve-link";
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
  forge: Forge;
  // Canonical https repo URL, for building forge file links in resolveLink.
  repoUrl: string;
  projectId: string;
  gitSourceId: string;
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
  resolveSitemap: (docoPath: string) => Promise<SitemapResolution | null>;
  // When true, the file is a Mintlify `.mdx`: its body is converted to docomd
  // before parsing, and the maintainer must supply the docolin frontmatter.
  mintlify: boolean;
  // The Mintlify project's icon library; card icon names are rewritten with its
  // set prefix. Ignored when `mintlify` is false.
  mintlifyIconLibrary: MintlifyIconLibrary;
}

export type ProcessFileResult =
  | { status: "created" | "updated"; docoId: string; versionId: string }
  // An opted-out README (no docolin frontmatter): not a doco, not an error.
  // `tombstoned` is true when a previously-synced doco at this path was marked
  // deleted because the file opted back out.
  | { status: "skipped"; tombstoned: boolean }
  | {
      status: "errored";
      errorCode: string;
      errorMessage: string;
      errorDetails: Record<string, unknown>;
    };

type ProcessFileError = Extract<ProcessFileResult, { status: "errored" }>;

export type ValidateFileResult =
  | { ok: true; parsed: ParsedDoco; storedAuthors: StoredAuthor[] }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: ProcessFileError };

// The error-able prefix of processFile: fetch, Mintlify-convert, parse + validate
// frontmatter, and resolve author handles. No rendering or DB write, so the sync
// can validate every changed file cheaply before any version is written (the
// atomic gate). processFile reuses the result so the work isn't repeated.
export async function validateFile(
  filePath: string,
  ctx: ProcessFileContext,
): Promise<ValidateFileResult> {
  // 1. Fetch the file content from the forge's raw-content path.
  const fetched = await ctx.forge.fetchFile(ctx.ref, filePath);
  if (!fetched.ok) {
    return {
      ok: false,
      skipped: false,
      error: {
        status: "errored",
        errorCode: "fetch_failed",
        errorMessage: `Could not fetch ${filePath} from the source repo: ${fetched.message}`,
        errorDetails: { reason: fetched.reason },
      },
    };
  }

  // 1.5 READMEs are opt-in: without a `docolin:` frontmatter key the file is
  // written for the repo's forge page, not docolin, so it is skipped silently
  // instead of surfacing as a broken doco. Checked on the raw content (a
  // Mintlify file's frontmatter is kept as authored, so the key sits there too).
  if (isOptOutReadme(filePath, fetched.content)) return { ok: false, skipped: true };

  // 2. For a Mintlify import, convert the MDX body to docomd and keep the
  // maintainer's frontmatter; everything downstream treats it as a docolin file.
  const source = ctx.mintlify
    ? mintlifyMdxToDocoSource(fetched.content, ctx.mintlifyIconLibrary)
    : fetched.content;

  // 3. Parse + validate frontmatter (pure; author handles are resolved next).
  const parseResult = parseDocoFile(source);
  if (!parseResult.ok) {
    // A Mintlify page that hasn't had docolin frontmatter added yet: tell the
    // maintainer exactly what to add instead of dumping a raw schema error.
    if (ctx.mintlify && !hasDocolinFrontmatter(fetched.content)) {
      return {
        ok: false,
        skipped: false,
        error: {
          status: "errored",
          errorCode: "mintlify_frontmatter_required",
          errorMessage:
            "Imported from Mintlify. Add docolin frontmatter to this page: an `authors` list (at least one) and a `docolin:` block with `kind` and `type`.",
          errorDetails: { underlying: parseResult.error.code },
        },
      };
    }
    return {
      ok: false,
      skipped: false,
      error: {
        status: "errored",
        errorCode: parseResult.error.code,
        errorMessage: parseResult.error.message,
        errorDetails: parseResult.error.details,
      },
    };
  }

  // 4. Resolve author handles to userIds (server-only). A handle that isn't a
  // real docolin user errors the file rather than silently dropping attribution.
  const authorsResult = await resolveStoredAuthors(parseResult.parsed.frontmatter.authors);
  if (!authorsResult.ok) {
    return {
      ok: false,
      skipped: false,
      error: {
        status: "errored",
        errorCode: "handle_not_found",
        errorMessage: `Author handle(s) don't exist on docolin: ${authorsResult.missing.join(", ")}`,
        errorDetails: { missingHandles: authorsResult.missing },
      },
    };
  }
  return { ok: true, parsed: parseResult.parsed, storedAuthors: authorsResult.authors };
}

export async function processFile(
  filePath: string,
  ctx: ProcessFileContext,
): Promise<ProcessFileResult> {
  // Validate first (fetch + parse + authors); reuse the parsed result to render.
  const validated = await validateFile(filePath, ctx);
  if (!validated.ok) {
    if (validated.skipped) {
      // Opt-out after opt-in: if this README synced as a doco before its
      // docolin block was removed, tombstone it like an upstream deletion (the
      // URL keeps serving the last version with a banner, never a 404).
      const deletion = await processFileDelete(filePath, ctx.gitSourceId);
      return { status: "skipped", tombstoned: deletion.status === "deleted" };
    }
    return validated.error;
  }
  const { parsed, storedAuthors } = validated;

  // 4. Convert the body. Image archival errors get collected here; they don't
  // fail the file since the markdown still renders with the source URL.
  const assetErrors: SyncFileErrorRecord[] = [];
  const imageArchiver = makeImageArchiver({
    bucket: ctx.bucket,
    projectId: ctx.projectId,
    rawUrl: (path) => ctx.forge.rawFileUrl(ctx.ref, path),
    docoPath: filePath,
    // Mintlify authors `/images/x` relative to the docs root, not the repo root.
    absoluteBase: ctx.mintlify ? ctx.subpath : null,
    onError: (err) => assetErrors.push(err),
  });
  const docoLinkCtx = linkContextFor(ctx, filePath);
  const convertedBody = await convertBody(parsed.body, {
    rewriteImageUrl: imageArchiver,
    rewriteLink: (url) => resolveLink(url, docoLinkCtx),
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
  const chosenSitemap = resolveDocoSitemap(parsed.frontmatter.docolin.sitemap, filePath, cascade);
  // Resolve sitemap urls through the same link model as body links, against the
  // sitemap's own source location (its file dir, or the doco for an override).
  const sitemap =
    chosenSitemap === null
      ? null
      : resolveSitemapLinks(chosenSitemap.sitemap, linkContextFor(ctx, chosenSitemap.sourcePath));

  // 6. Find or create the doco row, then write the version.
  const existing = await db
    .select()
    .from(docos)
    .where(and(eq(docos.gitSourceId, ctx.gitSourceId), eq(docos.pathInSource, filePath)))
    .limit(1);

  if (existing.length === 0) {
    return await createDocoAndFirstVersion(
      filePath,
      parsed,
      storedAuthors,
      convertedBody,
      sitemap,
      ctx,
    );
  }
  return await addVersionToExistingDoco(
    existing[0].id,
    parsed,
    storedAuthors,
    convertedBody,
    sitemap,
    ctx,
  );
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
  authors: StoredAuthor[],
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
      authors,
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
  authors: StoredAuthor[],
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
      await updateVersionRow(
        tx,
        versionId,
        ctx.versionTag,
        parsed,
        authors,
        convertedBody,
        sitemap,
      );
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
        authors,
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
  authors: StoredAuthor[],
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
      authors,
      sitemap,
      frontmatterExtra: parsed.frontmatterExtra,
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
  authors: StoredAuthor[],
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
      authors,
      sitemap,
      frontmatterExtra: parsed.frontmatterExtra,
      bodyText: convertedBody,
      bodyFormat: "commonmark",
    })
    .where(eq(versions.id, versionId));
}

// Builds the link-resolution context for a doco at `docoPath` (or a sitemap at
// its source path). Body links, sitemap urls, and prev/next all resolve through
// this same context so they can't drift; the commit pin is the version's ref.
function linkContextFor(ctx: ProcessFileContext, docoPath: string): LinkResolveContext {
  return {
    docoPath,
    subpath: ctx.subpath,
    allowMdx: ctx.mintlify,
    websiteBase: `/${ctx.orgSlug}/${ctx.projectSlug}`,
    forge: { kind: "repo", repoUrl: ctx.repoUrl, ref: { commit: ctx.ref } },
  };
}
