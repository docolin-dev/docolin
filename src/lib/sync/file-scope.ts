// File-eligibility rules for what the sync engine ingests. Pure functions so
// the orchestrator can filter a flat tree response without DB or network.

import { SITEMAP_FILE_PATH } from "./sitemap";

// True for files the engine should treat as docos:
// - Path is under the configured subpath (or anywhere if subpath is null/empty).
// - Filename ends in `.md` (case-insensitive).
// - Not `README.md` at the repo root (excluded for v1; reconsider later).
//
// `docolin/sitemap.yaml` is handled by its own pipeline; this function ignores it.
export function isDocoFile(filePath: string, subpath: string | null): boolean {
  if (!hasMarkdownExtension(filePath)) return false;
  if (filePath === "README.md") return false;
  if (!isUnderSubpath(filePath, subpath)) return false;
  return true;
}

// True when the file path matches the project's optional sitemap file
// location. The orchestrator routes hits here to the sitemap loader instead
// of the per-doco processor.
export function isSitemapFile(filePath: string, subpath: string | null): boolean {
  if (subpath === null || subpath.length === 0) return filePath === SITEMAP_FILE_PATH;
  const trimmed = subpath.endsWith("/") ? subpath.slice(0, -1) : subpath;
  return filePath === `${trimmed}/${SITEMAP_FILE_PATH}`;
}

function hasMarkdownExtension(filePath: string): boolean {
  // CLAUDE.md 3.8: no regex. Case-fold and check the suffix.
  return filePath.toLowerCase().endsWith(".md");
}

function isUnderSubpath(filePath: string, subpath: string | null): boolean {
  if (subpath === null || subpath.length === 0) return true;
  const trimmed = subpath.endsWith("/") ? subpath.slice(0, -1) : subpath;
  // `${trimmed}/` (with trailing slash) prevents prefix-as-substring false
  // positives like "docs2/foo" matching subpath "docs".
  return filePath.startsWith(`${trimmed}/`);
}
