import { isRelativePath, resolveRelativePath } from "$lib/sync/path-resolve";
import { isDocoFile } from "$lib/sync/file-scope";
import { pathFromSourcePath } from "$lib/doco-urls";
import { forgeSourceUrl, type ForgeRef } from "$lib/git/edit-url";
import type { SitemapNode } from "$lib/sync/sitemap-schema";

// The single link-resolution model for docolin, shared by every authored link
// so they can't drift: body links (rewritten at sync in convertBody), sitemap
// URLs, and prev/next. The local-folder preview runs the same function client-
// side, so a preview matches what a sync would publish. Pure + browser-safe.

// Splits a "#fragment" off a link so the path can be classified and the
// fragment re-attached afterward. Exported for the body pipeline.
export function splitFragment(url: string): { path: string; fragment: string } {
  const hash = url.indexOf("#");
  if (hash === -1) return { path: url, fragment: "" };
  return { path: url.slice(0, hash), fragment: url.slice(hash) };
}

// Where a link to a non-doco repo file points. A published doco sends the
// reader to the file on the forge, pinned to the version's commit. The local
// preview has no commit (it shows your working copy), so it serves the file
// from a client route instead.
export type ForgeTarget =
  | { kind: "repo"; repoUrl: string; ref: ForgeRef }
  | { kind: "preview"; blobBase: string };

export interface LinkResolveContext {
  // The linking doco's own path in the source repo, e.g.
  // "docs/authoring/overview.md". Relative links resolve against its directory.
  docoPath: string;
  // The docs subpath stripped from public doco URLs (e.g. "docs"), or null.
  subpath: string | null;
  // Whether a `.mdx` target counts as a doco (Mintlify imports only).
  allowMdx: boolean;
  // Base for website doco links: "/{org}/{project}" (published) or
  // "/preview/{id}" (preview).
  websiteBase: string;
  // Where links to non-doco repo files go.
  forge: ForgeTarget;
}

// Resolves one authored link (from a body or frontmatter) to its final URL.
//
// The decision is LOCATION-based, not validity-based, so a target's current
// parse state never makes an inbound link go stale:
//   - external (http/https/mailto/scheme), website-absolute (/...), and
//     anchor-only (#...) links pass through unchanged. A full https:// URL is
//     the explicit override for the rules below.
//   - a relative link whose resolved repo path is a DOCO SLOT (isDocoFile)
//     becomes a website doco URL, whether or not that doco currently parses, so
//     fixing a broken target never requires re-resolving its inbound links.
//   - any other relative link (a non-doco repo file, or a `.md` outside the
//     docs scope) points at the forge file pinned to the synced commit, or, in
//     preview, at the local working file.
export function resolveLink(rawUrl: string, ctx: LinkResolveContext): string {
  const { path, fragment } = splitFragment(rawUrl);
  if (!isRelativePath(path)) return rawUrl;

  const repoPath = resolveRelativePath(ctx.docoPath, path);
  if (isDocoFile(repoPath, ctx.subpath, ctx.allowMdx)) {
    return `${ctx.websiteBase}/${pathFromSourcePath(repoPath, ctx.subpath)}${fragment}`;
  }
  if (ctx.forge.kind === "preview") {
    return `${ctx.forge.blobBase}/${encodeRepoPath(repoPath)}${fragment}`;
  }
  return forgeSourceUrl(ctx.forge.repoUrl, ctx.forge.ref, repoPath) + fragment;
}

// Per-segment encoding so spaces / non-ascii in a path don't break the URL,
// mirroring the forge URL builders.
function encodeRepoPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

// Resolves every `url` in a sitemap tree through resolveLink, so sidebar links
// follow the same model as body links. The context's `docoPath` should be the
// sitemap's own source location (its doco_sitemap.yaml path, or the doco for a
// frontmatter override), so relative entries resolve against the right base.
export function resolveSitemapLinks(nodes: SitemapNode[], ctx: LinkResolveContext): SitemapNode[] {
  return nodes.map((node) => {
    const next: SitemapNode = { title: node.title };
    if (node.url !== undefined) next.url = resolveLink(node.url, ctx);
    if (node.children !== undefined) next.children = resolveSitemapLinks(node.children, ctx);
    return next;
  });
}
