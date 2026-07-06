import { hasDocolinKey } from "./parse";

// File-eligibility rules for what the sync engine ingests. Pure functions so
// the orchestrator can filter a flat tree response without DB or network.

// True for files the engine should treat as doco SLOTS by path alone:
// - Path is under the configured subpath (or anywhere if subpath is null/empty).
// - Filename ends in `.md` (always) or `.mdx` (only `allowMdx`, i.e. Mintlify
//   imports; a plain docolin repo's stray `.mdx` is not a doco).
//
// READMEs are path-eligible but content-gated: they only become docos when they
// opt in with a `docolin:` frontmatter key (see isOptOutReadme, applied where
// the content is in hand). A relative link to an opted-out README still counts
// as a doco-slot link (resolve-link only sees the path); that dangling link is
// the author's to fix, same as linking to an errored file.
//
// `doco_sitemap.yaml` files end in `.yaml`, so they're excluded here and routed
// through the sitemap pipeline (see sitemap.ts isDocoSitemapFile).
export function isDocoFile(filePath: string, subpath: string | null, allowMdx = false): boolean {
  if (!hasMarkdownExtension(filePath, allowMdx)) return false;
  if (!isUnderSubpath(filePath, subpath)) return false;
  return true;
}

/** Whether the path names a README, in any directory and any case. */
export function isReadmePath(filePath: string): boolean {
  const slash = filePath.lastIndexOf("/");
  const name = (slash === -1 ? filePath : filePath.slice(slash + 1)).toLowerCase();
  return name === "readme.md" || name === "readme.mdx";
}

/** READMEs are opt-in: a README speaks to the repo's forge page, not to
 * docolin, so one without a `docolin:` frontmatter key is skipped silently
 * instead of surfacing as a broken doco. Adding the key (even before the block
 * is complete) opts the file in. */
export function isOptOutReadme(filePath: string, source: string): boolean {
  return isReadmePath(filePath) && !hasDocolinKey(source);
}

function hasMarkdownExtension(filePath: string, allowMdx: boolean): boolean {
  // CLAUDE.md 3.8: no regex. Case-fold and check the suffix.
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || (allowMdx && lower.endsWith(".mdx"));
}

function isUnderSubpath(filePath: string, subpath: string | null): boolean {
  if (subpath === null || subpath.length === 0) return true;
  const trimmed = subpath.endsWith("/") ? subpath.slice(0, -1) : subpath;
  // `${trimmed}/` (with trailing slash) prevents prefix-as-substring false
  // positives like "docs2/foo" matching subpath "docs".
  return filePath.startsWith(`${trimmed}/`);
}
