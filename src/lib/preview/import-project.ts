import { isDocoFile, isOptOutReadme } from "$lib/sync/file-scope";
import { parseDocoFile, MINTLIFY_FRONTMATTER_REQUIRED, type ParseError } from "$lib/sync/parse";
import {
  createSitemapResolver,
  resolveDocoSitemap,
  type SitemapFileFetch,
} from "$lib/sync/sitemap";
import {
  findMintlifyConfig,
  docsDirForConfig,
  parseMintlifyConfig,
  type MintlifyIconLibrary,
} from "$lib/sync/mintlify/detect";
import { navToSitemap } from "$lib/sync/mintlify/nav-to-sitemap";
import { mintlifyMdxToDocoSource, hasDocolinFrontmatter } from "$lib/sync/mintlify/convert";
import { pathFromSourcePath } from "$lib/doco-urls";
import type { DocoFrontmatter } from "$lib/sync/frontmatter-schema";
import type { Sitemap } from "$lib/sync/sitemap-schema";
import type { LocalFileSource } from "./local-source";

// Imports a local docs folder into an in-memory index, reusing the exact sync
// pipeline (file-scope, the frontmatter parser, the sitemap cascade, and the
// Mintlify detection + conversion) so a preview matches what a sync would
// publish. Body canonicalization + rendering happen lazily per view (see
// render-doco); this eager pass only parses frontmatter, resolves sidebars, and
// collects hard errors so the overview and sidebar are ready immediately.
// 100% client-side, nothing leaves the device.
//
// Mintlify folders work like they do at sync time (run.ts resolveMintlify): a
// docs.json / mint.json marks the project, `.mdx` files become docos, bodies
// convert through mintlifyMdxToDocoSource, the nav becomes every doco's
// sidebar, and a page still missing docolin frontmatter surfaces as a
// mintlify_frontmatter_required error, which makes the preview a pre-push
// checklist for a migration.

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
  // The docs root the import actually used: the user's subpath, or for a
  // Mintlify folder picked at the repo root, the config's directory (mirroring
  // the sync's auto-detection). The render context must use THIS, not the
  // user-typed subpath.
  effectiveSubpath: string | null;
  // Non-null when the folder is a Mintlify project; render-doco switches its
  // link model (mdx doco slots, docs-root-absolute links and images) on it.
  mintlify: { iconLibrary: MintlifyIconLibrary } | null;
}

// The path to land on when opening a project: the first doco, or the first
// errored doco (so its error shows), or null when the folder has neither.
export function firstDocoPath(project: ImportedProject): string | null {
  const doco = project.docos.keys().next().value;
  if (doco !== undefined) return doco;
  return project.errors.keys().next().value ?? null;
}

export interface ImportOptions {
  // The preview project id; Mintlify nav urls resolve into its URL space
  // (`/preview/{projectSlug}/…`), mirroring how the sync builds them for
  // `/{org}/{project}/…`.
  projectSlug: string;
  onProgress?: (done: number, total: number) => void;
}

// The sync's tailored guidance (shared via parse.ts) in the preview's error
// shape, so a migrating maintainer sees the same words in both places.
const MINTLIFY_FRONTMATTER_ERROR: ParseError = { ...MINTLIFY_FRONTMATTER_REQUIRED, details: {} };

interface MintlifyMode {
  iconLibrary: MintlifyIconLibrary;
  sitemap: Sitemap | null;
}

// Detects a Mintlify project in the listed files and loads its config,
// mirroring run.ts resolveMintlify minus the DB write: the user's subpath wins;
// with none, the config's directory becomes the docs root.
async function resolveMintlify(
  source: LocalFileSource,
  paths: string[],
  subpath: string | null,
  projectSlug: string,
): Promise<{ mode: MintlifyMode; effectiveSubpath: string | null } | null> {
  const configPath = findMintlifyConfig(paths, subpath);
  if (configPath === null) return null;

  const docsDir = docsDirForConfig(configPath);
  const effectiveSubpath = subpath ?? (docsDir.length > 0 ? docsDir : null);

  const configText = await source.readText(configPath);
  const config = configText === null ? null : parseMintlifyConfig(configText);
  let sitemap: Sitemap | null = null;
  if (config !== null) {
    const nav = navToSitemap(config.navigation, { orgSlug: "preview", projectSlug });
    if (nav.length > 0) sitemap = nav;
  }
  return {
    mode: { iconLibrary: config?.iconLibrary ?? "fontawesome", sitemap },
    effectiveSubpath,
  };
}

export async function importProject(
  source: LocalFileSource,
  subpath: string | null,
  options: ImportOptions,
): Promise<ImportedProject> {
  const listed = await source.listFiles(subpath);
  const detected = await resolveMintlify(source, listed, subpath, options.projectSlug);
  const mintlify = detected?.mode ?? null;
  const effectiveSubpath = detected === null ? subpath : detected.effectiveSubpath;

  // Auto-detection can narrow the scope (repo root picked, docs live deeper);
  // re-list so the import walks only the docs subtree, like the sync.
  const files = effectiveSubpath === subpath ? listed : await source.listFiles(effectiveSubpath);
  const docoFiles = files.filter((f) => isDocoFile(f, effectiveSubpath, mintlify !== null));
  const total = docoFiles.length;
  options.onProgress?.(0, total);

  const fetchFile: SitemapFileFetch = async (path) => {
    const content = await source.readText(path);
    return content === null ? { ok: false, reason: "not_found" } : { ok: true, content };
  };
  // Mintlify projects have no doco_sitemap.yaml cascade; the nav is the sidebar.
  const resolver =
    mintlify === null ? createSitemapResolver({ subpath: effectiveSubpath, fetchFile }) : null;

  const docos = new Map<string, ImportedDoco>();
  const errors = new Map<string, ImportedDocoError>();

  for (let i = 0; i < docoFiles.length; i++) {
    const pathInSource = docoFiles[i];
    const pathFromProjectRoot = pathFromSourcePath(pathInSource, effectiveSubpath);
    const text = await source.readText(pathInSource);
    // READMEs are opt-in, same rule as the sync: no `docolin:` frontmatter key,
    // no doco and no error row (the file speaks to the forge page, not docolin).
    if (text !== null && !isOptOutReadme(pathInSource, text)) {
      const docoSource =
        mintlify !== null ? mintlifyMdxToDocoSource(text, mintlify.iconLibrary) : text;
      const parsed = parseDocoFile(docoSource);
      if (!parsed.ok) {
        // A Mintlify page that hasn't had docolin frontmatter added yet gets
        // the same tailored guidance the sync gives, not a raw schema dump.
        const error =
          mintlify !== null && !hasDocolinFrontmatter(text)
            ? MINTLIFY_FRONTMATTER_ERROR
            : parsed.error;
        errors.set(pathFromProjectRoot, { pathInSource, pathFromProjectRoot, error });
      } else if (mintlify !== null) {
        docos.set(pathFromProjectRoot, {
          pathInSource,
          pathFromProjectRoot,
          frontmatter: parsed.parsed.frontmatter,
          body: parsed.parsed.body,
          sitemap: mintlify.sitemap,
          sitemapBasePath: mintlify.sitemap === null ? null : (effectiveSubpath ?? ""),
        });
      } else {
        // resolver is non-null exactly when mintlify is null; a null cascade
        // just means no doco_sitemap.yaml applies.
        const cascade = resolver === null ? null : await resolver.resolve(pathInSource);
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
    options.onProgress?.(i + 1, total);
  }

  return { docos, errors, effectiveSubpath, mintlify };
}
