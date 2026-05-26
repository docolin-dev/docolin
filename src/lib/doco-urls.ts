import { baseLocale, locales } from "$paraglide/runtime";
import { SITE_URL } from "$lib/site";
import { slugify } from "$lib/slug";

// Shared mapping between a doco's `path_in_source` (filesystem path inside the
// git repo) and its public URL `path-from-project-root`. The viewer needs the
// inverse direction; the sync engine's cache-purge needs the forward direction.
// One module, one set of rules, so the two never drift out of sync.

// Strip leading + trailing slashes from a subpath. Treat null / empty the
// same: no subpath in effect.
function normalizeSubpath(subpath: string | null): string {
  if (subpath === null || subpath.length === 0) return "";
  let s = subpath;
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

// `docs/intro.md` (with subpath "docs") → `intro`
// `guides/install.md` (no subpath)      → `guides/install`
// `devtools/mcp.mdx` (Mintlify import)  → `devtools/mcp`
// `README.md` (no subpath)              → `README`
export function pathFromSourcePath(pathInSource: string, subpath: string | null): string {
  const sub = normalizeSubpath(subpath);
  let out = pathInSource;
  if (sub.length > 0 && out.startsWith(`${sub}/`)) {
    out = out.slice(sub.length + 1);
  }
  return stripDocExtension(out);
}

// Drops a trailing `.md` or `.mdx` (Mintlify imports) extension, case-insensitive.
export function stripDocExtension(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mdx")) return path.slice(0, -4);
  if (lower.endsWith(".md")) return path.slice(0, -3);
  return path;
}

// Inverse direction. `intro` (subpath "docs") → `docs/intro.md`.
export function rebuildPathInSource(urlPath: string, subpath: string | null): string {
  const sub = normalizeSubpath(subpath);
  const base = sub.length > 0 ? `${sub}/${urlPath}` : urlPath;
  return `${base}.md`;
}

/** A specific version selected by a URL @-suffix. */
export type VersionRef = { kind: "number"; value: number } | { kind: "sha"; value: string };

function isAllDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) {
    if (c < "0" || c > "9") return false;
  }
  return true;
}

function isAllHexLower(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) {
    const isDigit = c >= "0" && c <= "9";
    const isHexLetter = c >= "a" && c <= "f";
    if (!isDigit && !isHexLetter) return false;
  }
  return true;
}

// Splits a URL path into (path, versionRef). The version ref is only
// recognized when the @-suffix is unambiguously a versionNumber (all digits)
// or a commit SHA prefix (4+ lowercase hex chars). Anything else stays in the
// path so paths containing a literal `@` aren't silently truncated. Shared by
// the doco viewer, the raw routes, and the MCP fetch tool.
export function parseVersionRef(urlPath: string): {
  pathPart: string;
  versionRef: VersionRef | null;
} {
  const at = urlPath.lastIndexOf("@");
  if (at === -1 || at === urlPath.length - 1) return { pathPart: urlPath, versionRef: null };
  const suffix = urlPath.slice(at + 1);
  const before = urlPath.slice(0, at);

  if (isAllDigits(suffix)) {
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n) && n > 0) {
      return { pathPart: before, versionRef: { kind: "number", value: n } };
    }
  }
  if (suffix.length >= 4 && suffix.length <= 40 && isAllHexLower(suffix)) {
    return { pathPart: before, versionRef: { kind: "sha", value: suffix } };
  }
  return { pathPart: urlPath, versionRef: null };
}

// Public URLs for one doco across every locale paraglide is configured for.
// Used by the cache purger so a content change invalidates every localized
// variant of the latest URL. Versioned URLs (`...@{sha}`) are immutable and
// never need purging.
export function publicLatestUrls(args: {
  orgSlug: string;
  projectSlug: string;
  pathFromProjectRoot: string;
}): string[] {
  const urls: string[] = [];
  for (const loc of locales) {
    const prefix = loc === baseLocale ? "" : `/${loc}`;
    urls.push(
      `${SITE_URL}${prefix}/${args.orgSlug}/${args.projectSlug}/${args.pathFromProjectRoot}`,
    );
  }
  return urls;
}

// Canonical URL ref for a discussion: "{number}-{title-slug}", or just the
// number when the title has no sluggable characters. The number is what the
// route resolves on; the slug is SEO sugar (regenerated from the title, stale
// slugs 301 to this canonical form).
export function discussionRef(number: number, title: string): string {
  const slug = slugify(title);
  return slug.length > 0 ? `${String(number)}-${slug}` : String(number);
}

// Parses the leading integer of a discussion URL ref ("12-some-slug" -> 12).
// Returns null when there's no leading positive integer. No regex (CLAUDE.md 3.8).
export function parseDiscussionNumber(ref: string): number | null {
  let digits = "";
  for (const c of ref) {
    if (c >= "0" && c <= "9") digits += c;
    else break;
  }
  if (digits.length === 0) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Public discussion URLs across every locale, for cache purging after a
// discussion write. `ref` omitted purges the per-doco thread list; supplied
// (the canonical "{number}-{slug}") purges the single thread page. The
// discussion routes are cached like the doco viewer (public, mutable), so
// writes purge them on the same best-effort basis as a sync.
export function discussionUrls(args: {
  orgSlug: string;
  projectSlug: string;
  pathFromProjectRoot: string;
  ref?: string;
}): string[] {
  const base = `${args.orgSlug}/${args.projectSlug}/${args.pathFromProjectRoot}/discussions`;
  const suffix = args.ref === undefined ? "" : `/${args.ref}`;
  const urls: string[] = [];
  for (const loc of locales) {
    const prefix = loc === baseLocale ? "" : `/${loc}`;
    urls.push(`${SITE_URL}${prefix}/${base}${suffix}`);
  }
  return urls;
}
