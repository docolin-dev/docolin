import { convertBody } from "$lib/sync/body-pipeline";
import {
  resolveLink,
  resolveSitemapLinks,
  splitFragment,
  type LinkResolveContext,
} from "$lib/doco/resolve-link";
import { isRelativePath, resolveRelativePath } from "$lib/sync/path-resolve";
import { parseTimeEstimate } from "$lib/sync/time-estimate";
import { pathFromSourcePath } from "$lib/doco-urls";
import { renderMarkdownPreview } from "$lib/markdown-shared";
import { extractToc, extractReadingMinutes } from "$lib/markdown/render";
import type { DocoFrontmatter } from "$lib/sync/frontmatter-schema";
import type { DocoViewData, ResolvedAuthor, ResolvedNavLink } from "$lib/doco/viewer-data";
import type { ImportedDoco, ImportedProject } from "./import-project";
import type { LocalFileSource } from "./local-source";

// Renders one imported doco into the same DocoViewData the live viewer's server
// load produces, so the shared DocoView renders a preview identically to a
// published page, just sourced from local files. Body canonicalization (local
// images to blob: URLs, links through the preview link model) and rendering run
// here, lazily per view. 100% client-side.

// A non-fatal issue found while rendering a preview doco: the doco still
// renders, but the problems console lists it. `detail` is the offending url.
export interface PreviewWarning {
  kind: "missing-image" | "broken-link";
  detail: string;
}

export interface RenderedPreview {
  data: DocoViewData;
  warnings: PreviewWarning[];
  // Revoke the blob: URLs created for local images when navigating away or
  // re-rendering, so they don't leak.
  revoke(): void;
}

export interface PreviewRenderContext {
  // The preview project id (the `<foldername-nanoid>` in the URL). With
  // org.slug = "preview" and project.slug = id, DocoView's `/{org}/{project}/…`
  // URLs become `/preview/{id}/…`, matching the resolved links and sitemap.
  projectId: string;
  projectName: string;
  subpath: string | null;
  source: LocalFileSource;
  project: ImportedProject;
  // Resolves frontmatter authors to display-ready form. Injected so the route
  // can hydrate `{handle}` entries with display names from the public endpoint.
  resolveAuthors: (authors: DocoFrontmatter["authors"]) => Promise<ResolvedAuthor[]>;
}

export async function renderPreviewDoco(
  doco: ImportedDoco,
  ctx: PreviewRenderContext,
): Promise<RenderedPreview> {
  const blobUrls: string[] = [];
  const warnings: PreviewWarning[] = [];
  const websiteBase = `/preview/${ctx.projectId}`;
  const blobBase = `/preview/blob/${ctx.projectId}`;
  const docoPrefix = `${websiteBase}/`;

  const linkCtxFor = (docoPath: string): LinkResolveContext => ({
    docoPath,
    subpath: ctx.subpath,
    allowMdx: false,
    websiteBase,
    forge: { kind: "preview", blobBase },
  });

  // Canonicalize: local images become blob: URLs (a missing one is flagged),
  // links go through the preview link model (a relative link to a doco not in
  // the folder is flagged). Then render with the same pipeline as published.
  const converted = await convertBody(doco.body, {
    rewriteImageUrl: async (url) => {
      const t = url.trim();
      if (
        t.length === 0 ||
        t.startsWith("http://") ||
        t.startsWith("https://") ||
        t.startsWith("data:")
      ) {
        return url;
      }
      const repoPath = t.startsWith("/") ? t.slice(1) : resolveRelativePath(doco.pathInSource, t);
      const blob = await ctx.source.readBlob(repoPath);
      if (blob === null) {
        warnings.push({ kind: "missing-image", detail: url });
        return url;
      }
      const blobUrl = URL.createObjectURL(blob);
      blobUrls.push(blobUrl);
      return blobUrl;
    },
    rewriteLink: (url) => {
      const resolved = resolveLink(url, linkCtxFor(doco.pathInSource));
      if (resolved.startsWith(docoPrefix)) {
        const key = resolved.slice(docoPrefix.length).split("#")[0];
        if (!ctx.project.docos.has(key)) warnings.push({ kind: "broken-link", detail: url });
      }
      return resolved;
    },
  });
  const bodyHtml = await renderMarkdownPreview(converted, {
    language: doco.frontmatter.docolin.language,
  });

  const sitemap =
    doco.sitemap === null || doco.sitemapBasePath === null
      ? null
      : resolveSitemapLinks(doco.sitemap, linkCtxFor(doco.sitemapBasePath));

  const fm = doco.frontmatter;
  const d = fm.docolin;
  const linkCtx = linkCtxFor(doco.pathInSource);
  const time = d.time_estimate !== undefined ? parseTimeEstimate(d.time_estimate) : null;
  const authors = await ctx.resolveAuthors(fm.authors);

  const data: DocoViewData = {
    playground: false,
    // org="preview", project=id so DocoView's internal URLs resolve to /preview/{id}/…
    org: { slug: "preview", displayName: ctx.projectName },
    project: { slug: ctx.projectId, displayName: ctx.projectName },
    gitSource: { repoUrl: "", defaultBranch: "" },
    pathInSource: doco.pathInSource,
    doco: {
      id: doco.pathFromProjectRoot,
      versionId: doco.pathFromProjectRoot,
      title: fm.title,
      description: fm.description ?? null,
      kind: d.kind,
      type: d.type,
      status: d.status,
      difficulty: d.difficulty ?? null,
      timeEstimateMinMinutes: time === null ? null : time.minMinutes,
      timeEstimateMaxMinutes: time === null ? null : time.maxMinutes,
      language: d.language,
      appliesTo: d.applies_to,
      deletedAt: null,
      bodyText: converted,
      bodyHtml,
      toc: extractToc(converted),
      readingMinutes: extractReadingMinutes(converted),
      prevNav: resolveNav(d.prev, doco, ctx, linkCtx),
      nextNav: resolveNav(d.next, doco, ctx, linkCtx),
      sitemap,
      authors,
      verifiedCount: 0,
      pangoScore: null,
      lastConfirmedAt: null,
      versionNumber: 1,
      commitSha: null,
      versionTag: null,
      pathFromProjectRoot: doco.pathFromProjectRoot,
      publishedAt: new Date().toISOString(),
      versions: [],
    },
  };

  return {
    data,
    warnings,
    revoke: () => {
      for (const u of blobUrls) URL.revokeObjectURL(u);
    },
  };
}

// Resolves a prev/next link against the in-memory index (the local equivalent of
// the server's DB lookup): an existing local doco becomes a rich card; anything
// else goes through the shared link model (forge file / external / soft kind).
function resolveNav(
  raw: string | undefined,
  doco: ImportedDoco,
  ctx: PreviewRenderContext,
  linkCtx: LinkResolveContext,
): ResolvedNavLink | null {
  if (raw === undefined) return null;

  const { path } = splitFragment(raw);
  let targetKey: string | null = null;
  if (isRelativePath(path)) {
    targetKey = pathFromSourcePath(resolveRelativePath(doco.pathInSource, path), ctx.subpath);
  } else if (path.startsWith(`/preview/${ctx.projectId}/`)) {
    targetKey = path.slice(`/preview/${ctx.projectId}/`.length);
  }

  if (targetKey !== null) {
    const target = ctx.project.docos.get(targetKey);
    if (target !== undefined) {
      return {
        kind: "resolved",
        title: target.frontmatter.title,
        kindPath: target.frontmatter.docolin.kind,
        href: `/preview/${ctx.projectId}/${target.pathFromProjectRoot}`,
      };
    }
  }
  return { kind: "raw", href: resolveLink(raw, linkCtx) };
}
