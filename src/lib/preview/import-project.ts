import { isDocoFile } from "$lib/sync/file-scope";
import { parseDocoFile, type ParseError } from "$lib/sync/parse";
import {
  createSitemapResolver,
  resolveDocoSitemap,
  type SitemapFileFetch,
} from "$lib/sync/sitemap";
import { pathFromSourcePath } from "$lib/doco-urls";
import type { DocoFrontmatter } from "$lib/sync/frontmatter-schema";
import type { Sitemap } from "$lib/sync/sitemap-schema";
import type { LocalFileSource } from "./local-source";

// Imports a local docs folder into an in-memory index, reusing the exact sync
// pipeline (file-scope, the frontmatter parser, the sitemap cascade) so a
// preview matches what a sync would publish. Body canonicalization + rendering
// happen lazily per view (see render-doco); this eager pass only parses
// frontmatter, resolves sidebars, and collects hard errors so the overview and
// sidebar are ready immediately. 100% client-side, nothing leaves the device.

// One imported doco's parsed data, before render. The raw sitemap + its source
// path are kept so urls resolve against the right base at render time.
export interface ImportedDoco {
  pathInSource: string;
  pathFromProjectRoot: string;
  frontmatter: DocoFrontmatter;
  body: string;
  sitemap: Sitemap | null;
  sitemapBasePath: string | null;
}

// A doco file that failed to parse: it wouldn't sync, so the preview shows the
// error instead of rendering (a linter for the push).
export interface ImportedDocoError {
  pathInSource: string;
  pathFromProjectRoot: string;
  error: ParseError;
}

export interface ImportedProject {
  // Both keyed by path-from-project-root (the preview URL path), so the render
  // route can look a doco up by its `[...path]`.
  docos: Map<string, ImportedDoco>;
  errors: Map<string, ImportedDocoError>;
}

// The path to land on when opening a project: the first doco, or the first
// errored doco (so its error shows), or null when the folder has neither.
export function firstDocoPath(project: ImportedProject): string | null {
  const doco = project.docos.keys().next().value;
  if (doco !== undefined) return doco;
  return project.errors.keys().next().value ?? null;
}

export async function importProject(
  source: LocalFileSource,
  subpath: string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportedProject> {
  const docoFiles = (await source.listFiles(subpath)).filter((f) => isDocoFile(f, subpath));
  const total = docoFiles.length;
  onProgress?.(0, total);

  const fetchFile: SitemapFileFetch = async (path) => {
    const content = await source.readText(path);
    return content === null ? { ok: false, reason: "not_found" } : { ok: true, content };
  };
  const resolver = createSitemapResolver({ subpath, fetchFile });

  const docos = new Map<string, ImportedDoco>();
  const errors = new Map<string, ImportedDocoError>();

  for (let i = 0; i < docoFiles.length; i++) {
    const pathInSource = docoFiles[i];
    const pathFromProjectRoot = pathFromSourcePath(pathInSource, subpath);
    const text = await source.readText(pathInSource);
    if (text !== null) {
      const parsed = parseDocoFile(text);
      if (!parsed.ok) {
        errors.set(pathFromProjectRoot, { pathInSource, pathFromProjectRoot, error: parsed.error });
      } else {
        const cascade = await resolver.resolve(pathInSource);
        const chosen = resolveDocoSitemap(
          parsed.parsed.frontmatter.docolin.sitemap,
          pathInSource,
          cascade,
        );
        docos.set(pathFromProjectRoot, {
          pathInSource,
          pathFromProjectRoot,
          frontmatter: parsed.parsed.frontmatter,
          body: parsed.parsed.body,
          sitemap: chosen === null ? null : chosen.sitemap,
          sitemapBasePath: chosen === null ? null : chosen.sourcePath,
        });
      }
    }
    onProgress?.(i + 1, total);
  }

  return { docos, errors };
}
