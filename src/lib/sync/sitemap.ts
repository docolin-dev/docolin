import { parse as parseYaml } from "yaml";
import { fetchFileFromJsDelivr } from "$lib/git/jsdelivr";
import { sitemapFileSchema, type Sitemap } from "./sitemap-schema";

// Sitemap discovery + resolution for a synced project.
//
// Discovery: one file at `docolin/sitemap.yaml` in the REPO ROOT, regardless
// of the project's docs subpath. Treating `docolin/` as project-level config
// (not docs-level content) means it sits alongside README / package.json,
// not under the docs tree. Missing file = no sidebar in v1; empty file =
// explicit no-sidebar (forward-compatible with future auto-detect).
//
// Per-doco override: the doco's frontmatter `sitemap:` field, if present,
// replaces the global for that doco only. The orchestrator picks per-doco
// when writing the version row.

export const SITEMAP_FILE_PATH = "docolin/sitemap.yaml";

export type GlobalSitemapResult =
  | { status: "found"; sitemap: Sitemap }
  | { status: "empty" }
  | { status: "missing" }
  | { status: "invalid"; message: string };

export interface SitemapFetchTarget {
  owner: string;
  repo: string;
  ref: string;
  subpath: string | null;
}

// Builds the repo-relative path the sitemap file lives at. Always at the
// repo root, never under the project's docs subpath. Kept as a function for
// symmetry with other path helpers and to centralize future changes.
export function sitemapPathFor(_subpath: string | null): string {
  return SITEMAP_FILE_PATH;
}

export async function fetchGlobalSitemap(target: SitemapFetchTarget): Promise<GlobalSitemapResult> {
  const path = sitemapPathFor(target.subpath);
  const fetched = await fetchFileFromJsDelivr({
    owner: target.owner,
    repo: target.repo,
    ref: target.ref,
    path,
  });

  if (!fetched.ok) {
    if (fetched.reason === "not_found") return { status: "missing" };
    return { status: "invalid", message: fetched.message };
  }

  return parseGlobalSitemapText(fetched.content);
}

// Pulled out as a standalone helper so the parsing logic can be tested
// without going through the network fetch.
export function parseGlobalSitemapText(raw: string): GlobalSitemapResult {
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
    // `sitemap.yaml` containing only comments or a single null is the same
    // as empty: explicit opt-out of a sidebar.
    return { status: "empty" };
  }

  // The file shape is { sitemap: [...] }. An author who writes just an
  // array (no top-level key) is a common mistake; accept that too.
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

// Resolves which sitemap applies to a single doco. Pure function: takes the
// per-doco override (from frontmatter) and the project's global, returns the
// one to store on the version row. Null means "no sidebar."
export function resolveDocoSitemap(
  perDoco: Sitemap | undefined,
  global: GlobalSitemapResult,
): Sitemap | null {
  if (perDoco !== undefined) {
    return perDoco.length === 0 ? null : perDoco;
  }
  if (global.status === "found") return global.sitemap;
  // For "empty", "missing", and "invalid", the doco gets no sidebar. Invalid
  // global file is surfaced separately as a project-level sync error; the
  // per-doco render shouldn't break because of it.
  return null;
}
