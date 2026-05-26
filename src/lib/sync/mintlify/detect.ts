import { dirOf, docsRootDir } from "../sitemap";

// Detects whether a synced repo is a Mintlify docs project and where its config
// lives. Mintlify keeps one config file (`docs.json`, or the legacy `mint.json`)
// at the docs root; its directory is the docs subpath (notra keeps it at
// `apps/docs/docs.json`, so the docs root is `apps/docs`).

// Newest first: docs.json supersedes mint.json.
const CONFIG_FILES = ["docs.json", "mint.json"] as const;

export type MintlifyIconLibrary = "fontawesome" | "lucide" | "tabler";

export interface MintlifyConfig {
  /** docs.json `name`, used only for messaging; never as an author. */
  name: string | null;
  /** Raw `navigation` value, shape varies by Mintlify version. */
  navigation: unknown;
  /** `icons.library`, normalized. Mintlify defaults to Font Awesome. */
  iconLibrary: MintlifyIconLibrary;
}

// Mintlify's `icons.library` is fontawesome (default), lucide, or tabler.
function normalizeIconLibrary(icons: unknown): MintlifyIconLibrary {
  if (icons !== null && typeof icons === "object") {
    const library = (icons as Record<string, unknown>).library;
    if (library === "lucide" || library === "tabler") return library;
  }
  return "fontawesome";
}

// Finds the Mintlify config path in a repo file tree. When a subpath is already
// configured, only that directory is checked; otherwise the shallowest config in
// the tree wins (docs.json over mint.json at equal depth). Returns null if none.
export function findMintlifyConfig(paths: string[], subpath: string | null): string | null {
  const root = docsRootDir(subpath);
  if (root.length > 0) {
    for (const name of CONFIG_FILES) {
      const candidate = `${root}/${name}`;
      if (paths.includes(candidate)) return candidate;
    }
    return null;
  }

  let best: { path: string; depth: number; rank: number } | null = null;
  for (const path of paths) {
    const slash = path.lastIndexOf("/");
    const base = slash === -1 ? path : path.slice(slash + 1);
    const rank = (CONFIG_FILES as readonly string[]).indexOf(base);
    if (rank === -1) continue;
    const depth = path.split("/").length;
    if (best === null || depth < best.depth || (depth === best.depth && rank < best.rank)) {
      best = { path, depth, rank };
    }
  }
  return best?.path ?? null;
}

/** The candidate config path for a known docs subpath (for incremental syncs
 *  that don't fetch the whole tree). Yields each filename in preference order. */
export function configPathsFor(subpath: string | null): string[] {
  const root = docsRootDir(subpath);
  return CONFIG_FILES.map((name) => (root.length > 0 ? `${root}/${name}` : name));
}

/** The docs root directory implied by a config path (`apps/docs/docs.json` ->
 *  `apps/docs`, `docs.json` -> ``). */
export function docsDirForConfig(configPath: string): string {
  return dirOf(configPath);
}

// Parses a Mintlify config file. Returns null on malformed JSON (JSON.parse can
// only be guarded with try/catch; the failure is surfaced by the caller).
export function parseMintlifyConfig(json: string): MintlifyConfig | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (data === null || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  return {
    name: typeof obj.name === "string" ? obj.name : null,
    navigation: obj.navigation ?? null,
    iconLibrary: normalizeIconLibrary(obj.icons),
  };
}
