// File-eligibility rules for what the sync engine ingests. Pure functions so
// the orchestrator can filter a flat tree response without DB or network.

// True for files the engine should treat as docos:
// - Path is under the configured subpath (or anywhere if subpath is null/empty).
// - Filename ends in `.md` (always) or `.mdx` (only `allowMdx`, i.e. Mintlify
//   imports; a plain docolin repo's stray `.mdx` is not a doco).
// - Not `README.md` at the repo root (excluded for v1; reconsider later).
//
// `doco_sitemap.yaml` files end in `.yaml`, so they're excluded here and routed
// through the sitemap pipeline (see sitemap.ts isDocoSitemapFile).
export function isDocoFile(filePath: string, subpath: string | null, allowMdx = false): boolean {
  if (!hasMarkdownExtension(filePath, allowMdx)) return false;
  if (filePath === "README.md") return false;
  if (!isUnderSubpath(filePath, subpath)) return false;
  return true;
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
