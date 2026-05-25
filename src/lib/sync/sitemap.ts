import { parse as parseYaml } from "yaml";
import { sitemapFileSchema, type Sitemap } from "./sitemap-schema";

// Sitemap discovery + cascade resolution for a synced project.
//
// A project's sidebar comes from `doco_sitemap.yaml` files that live INSIDE the
// docs tree, co-located with the docs they describe. A file applies to every
// doco in its own directory and all subdirectories, until a nearer
// `doco_sitemap.yaml` overrides it for its own subtree. A doco's own frontmatter
// `sitemap:` field overrides everything for that one doco.
//
// Resolution walks up from a doco's directory to the docs root (the project's
// subpath, or the repo root when there is none) and uses the first
// `doco_sitemap.yaml` it finds. An empty file (or `sitemap: []`) is an explicit
// "no sidebar here" that shadows any parent. The walk never climbs above the
// docs root, so a file outside the project's subpath never applies.

export const DOCO_SITEMAP_FILENAME = "doco_sitemap.yaml";

export type SitemapFileResult =
  | { status: "found"; sitemap: Sitemap }
  | { status: "empty" }
  | { status: "missing" }
  | { status: "invalid"; message: string };

// Minimal fetch contract the resolver needs, so it can be unit-tested with a
// fake. Matches the relevant shape of fetchFileFromJsDelivr.
export type SitemapFileFetch = (
  path: string,
) => Promise<{ ok: true; content: string } | { ok: false; reason: string; message?: string }>;

// ---------- path helpers ----------

// Normalized docs-root directory for a subpath. "" means the repo root.
export function docsRootDir(subpath: string | null): string {
  if (subpath === null || subpath.length === 0) return "";
  return subpath.endsWith("/") ? subpath.slice(0, -1) : subpath;
}

// Directory portion of a repo-relative file path ("" for a root-level file).
export function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

// The sitemap file path for a given directory.
export function sitemapPathForDir(dir: string): string {
  return dir.length === 0 ? DOCO_SITEMAP_FILENAME : `${dir}/${DOCO_SITEMAP_FILENAME}`;
}

function isWithinDocsRoot(dir: string, root: string): boolean {
  if (root.length === 0) return true;
  return dir === root || dir.startsWith(`${root}/`);
}

// True when filePath is a `doco_sitemap.yaml` inside the project's docs root.
export function isDocoSitemapFile(filePath: string, subpath: string | null): boolean {
  const slash = filePath.lastIndexOf("/");
  const base = slash === -1 ? filePath : filePath.slice(slash + 1);
  if (base !== DOCO_SITEMAP_FILENAME) return false;
  return isWithinDocsRoot(dirOf(filePath), docsRootDir(subpath));
}

// Directories to consult for a doco, nearest first, ending at the docs root.
// Returns [] when the doco is not under the docs root (defensive; callers
// already filter with isDocoFile).
export function ancestorDirs(docoPath: string, subpath: string | null): string[] {
  const root = docsRootDir(subpath);
  let dir = dirOf(docoPath);
  if (!isWithinDocsRoot(dir, root)) return [];
  const chain: string[] = [dir];
  while (dir !== root) {
    const parent = dirOf(dir);
    // Guard against a path that can't reach the root (shouldn't happen given the
    // isWithinDocsRoot check above); stop rather than loop forever.
    if (parent === dir) break;
    dir = parent;
    chain.push(dir);
  }
  return chain;
}

// ---------- file parsing ----------

// Parses one `doco_sitemap.yaml` file's text into a result. Pulled out as a
// standalone helper so the parsing logic can be tested without a network fetch.
export function parseSitemapFileText(raw: string): SitemapFileResult {
  if (raw.trim().length === 0) return { status: "empty" };

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    return {
      status: "invalid",
      message: err instanceof Error ? `YAML parse failed: ${err.message}` : "YAML parse failed",
    };
  }

  if (parsed === null || parsed === undefined) {
    // A file containing only comments or a single null is the same as empty:
    // an explicit opt-out of a sidebar.
    return { status: "empty" };
  }

  // The file shape is { sitemap: [...] }. An author who writes just an array
  // (no top-level key) is a common mistake; accept that too.
  const candidate = Array.isArray(parsed)
    ? { sitemap: parsed }
    : (parsed as Record<string, unknown>);

  const result = sitemapFileSchema.safeParse(candidate);
  if (!result.success) {
    return {
      status: "invalid",
      message: result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }

  if (result.data.sitemap.length === 0) return { status: "empty" };
  return { status: "found", sitemap: result.data.sitemap };
}

// ---------- cascade resolver ----------

export interface SitemapResolver {
  // Resolve the cascade sitemap for a doco (the frontmatter override is applied
  // separately by resolveDocoSitemap). Null means "no sidebar."
  resolve(docoPath: string): Promise<Sitemap | null>;
  // The parse result for a specific directory's sitemap file (cached). The
  // orchestrator uses this to validate changed sitemap files and surface errors.
  resultForDir(dir: string): Promise<SitemapFileResult>;
}

// Builds a per-sync resolver. Each directory's sitemap file is fetched at most
// once (the cache stores the in-flight promise), so resolving many docos that
// share ancestor directories stays cheap. All fetches go through jsDelivr, off
// the GitHub API budget.
export function createSitemapResolver(opts: {
  subpath: string | null;
  fetchFile: SitemapFileFetch;
}): SitemapResolver {
  const cache = new Map<string, Promise<SitemapFileResult>>();

  function resultForDir(dir: string): Promise<SitemapFileResult> {
    const cached = cache.get(dir);
    if (cached !== undefined) return cached;
    const pending = loadDir(dir, opts.fetchFile);
    cache.set(dir, pending);
    return pending;
  }

  async function resolve(docoPath: string): Promise<Sitemap | null> {
    for (const dir of ancestorDirs(docoPath, opts.subpath)) {
      const res = await resultForDir(dir);
      if (res.status === "found") return res.sitemap;
      // An empty file is a definite answer: explicit no-sidebar, nearest wins.
      if (res.status === "empty") return null;
      // "missing" and "invalid" fall through to the parent directory. An invalid
      // file is surfaced as a per-file sync error elsewhere; it shouldn't blank
      // out the whole subtree's sidebar.
    }
    return null;
  }

  return { resolve, resultForDir };
}

async function loadDir(dir: string, fetchFile: SitemapFileFetch): Promise<SitemapFileResult> {
  const fetched = await fetchFile(sitemapPathForDir(dir));
  if (!fetched.ok) {
    if (fetched.reason === "not_found") return { status: "missing" };
    return { status: "invalid", message: fetched.message ?? "Could not fetch sitemap file" };
  }
  return parseSitemapFileText(fetched.content);
}

// ---------- per-doco resolution ----------

// Resolves which sitemap applies to a single doco: the per-doco frontmatter
// override if present, otherwise the cascade result. Null means "no sidebar."
export function resolveDocoSitemap(
  perDoco: Sitemap | undefined,
  cascade: Sitemap | null,
): Sitemap | null {
  if (perDoco !== undefined) {
    return perDoco.length === 0 ? null : perDoco;
  }
  return cascade;
}
