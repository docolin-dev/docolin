import type { SitemapNode } from "../sitemap-schema";

// Converts a Mintlify `navigation` config into a docolin sitemap (the sidebar).
// Mintlify's navigation has shifted across versions, so several shapes are
// handled: `{ tabs: [{ tab, groups }] }`, `{ groups: [...] }`, `{ pages: [...] }`,
// and the legacy array-of-groups form. Page entries are paths relative to the
// docs root, which is exactly docolin's path-from-project-root, so links are the
// absolute `/{org}/{project}/{path}` form.

interface NavContext {
  orgSlug: string;
  projectSlug: string;
}

export function navToSitemap(navigation: unknown, ctx: NavContext): SitemapNode[] {
  // Legacy mint.json: navigation is an array of groups.
  if (Array.isArray(navigation)) return convertEntries(navigation, ctx);
  if (navigation === null || typeof navigation !== "object") return [];

  const nav = navigation as Record<string, unknown>;
  if (Array.isArray(nav.tabs)) return convertTabs(nav.tabs, ctx);
  if (Array.isArray(nav.groups)) return convertEntries(nav.groups, ctx);
  if (Array.isArray(nav.pages)) return convertEntries(nav.pages, ctx);
  return [];
}

// A tab has no docolin equivalent (the sidebar is flat-topped), so each tab
// becomes a top-level group holding its own groups/pages.
function convertTabs(tabs: unknown[], ctx: NavContext): SitemapNode[] {
  const out: SitemapNode[] = [];
  for (const tab of tabs) {
    if (tab === null || typeof tab !== "object") continue;
    const t = tab as Record<string, unknown>;
    const title = typeof t.tab === "string" ? t.tab : null;
    const entries = Array.isArray(t.groups) ? t.groups : Array.isArray(t.pages) ? t.pages : [];
    const children = convertEntries(entries, ctx);
    if (children.length === 0) continue;
    if (title === null) out.push(...children);
    else out.push({ title, children });
  }
  return out;
}

// Entries are a mix of page-path strings and group objects (`{ group, pages }`).
function convertEntries(entries: unknown[], ctx: NavContext): SitemapNode[] {
  const out: SitemapNode[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      const node = pageNode(entry, ctx);
      if (node !== null) out.push(node);
      continue;
    }
    if (entry === null || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.group === "string") {
      // Drop a group that resolves to nothing (e.g. an OpenAPI-only group whose
      // every page is a generated endpoint).
      const children = convertEntries(Array.isArray(obj.pages) ? obj.pages : [], ctx);
      if (children.length > 0) out.push({ title: obj.group, children });
    } else if (typeof obj.page === "string") {
      const node = pageNode(obj.page, ctx);
      if (node !== null) out.push(node);
    }
  }
  return out;
}

function pageNode(page: string, ctx: NavContext): SitemapNode | null {
  // OpenAPI-generated endpoints ("GET /v1/posts") aren't files; skip them.
  if (page.includes(" ")) return null;
  const path = page.startsWith("/") ? page.slice(1) : page;
  if (path.length === 0 || path.startsWith("http://") || path.startsWith("https://")) return null;
  return {
    title: humanize(lastSegment(path)),
    url: `/${ctx.orgSlug}/${ctx.projectSlug}/${path}`,
  };
}

function lastSegment(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

// "getting-started" -> "Getting Started". Mintlify nav carries no page titles
// (they live in each page's frontmatter), so the slug is humanized as a fallback.
function humanize(slug: string): string {
  const spaced = slug.replaceAll("-", " ").replaceAll("_", " ");
  return spaced
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
