import type { SitemapNode } from "../sitemap-schema";

// Converts a Mintlify `navigation` config into a docolin sitemap (the sidebar).
// Mintlify's navigation has shifted across versions, so several shapes are
// handled: the wrapper levels `languages` / `versions` (docolin has ONE sidebar
// per project, so the first entry that yields content wins; see firstNonEmpty
// for the trade-off), the titled containers `tabs` / `anchors` / `dropdowns`
// (each becomes a top-level group), plain `groups` / `pages`, and the legacy
// array-of-groups form. Wrappers recurse, so `languages -> tabs -> groups`
// (mintlify/docs' own layout) works at any depth. Page entries are paths
// relative to the docs root, which is exactly docolin's path-from-project-root,
// so links are the absolute `/{org}/{project}/{path}` form.

interface NavContext {
  orgSlug: string;
  projectSlug: string;
}

export function navToSitemap(navigation: unknown, ctx: NavContext): SitemapNode[] {
  // Legacy mint.json: navigation is an array of groups.
  if (Array.isArray(navigation)) return convertEntries(navigation, ctx);
  if (navigation === null || typeof navigation !== "object") return [];

  const nav = navigation as Record<string, unknown>;
  // i18n / versioned navs: the first entry is Mintlify's default; the others
  // describe the same docs in another language/version, not more sidebar.
  if (Array.isArray(nav.languages)) return firstNonEmpty(nav.languages, ctx);
  if (Array.isArray(nav.versions)) return firstNonEmpty(nav.versions, ctx);
  if (Array.isArray(nav.tabs)) return convertWrappers(nav.tabs, "tab", ctx);
  if (Array.isArray(nav.anchors)) return convertWrappers(nav.anchors, "anchor", ctx);
  if (Array.isArray(nav.dropdowns)) return convertWrappers(nav.dropdowns, "dropdown", ctx);
  if (Array.isArray(nav.groups)) return convertEntries(nav.groups, ctx);
  if (Array.isArray(nav.pages)) return convertEntries(nav.pages, ctx);
  return [];
}

// The first wrapper entry that yields sidebar content, NOT strictly the first
// (default) entry: a version stub with no pages yet, or a nav shape we don't
// recognize, shouldn't blank the whole sidebar. Trade-off for `languages`: a
// default language whose every page gets dropped (e.g. all OpenAPI endpoints)
// falls through to the next language's nav. That's deliberate; some sidebar
// beats none, and a default language with zero real pages is vanishingly rare.
function firstNonEmpty(items: unknown[], ctx: NavContext): SitemapNode[] {
  for (const item of items) {
    const out = navToSitemap(item, ctx);
    if (out.length > 0) return out;
  }
  return [];
}

// A titled container level (tab / anchor / dropdown) has no docolin equivalent
// (the sidebar is flat-topped), so each becomes a top-level group holding its
// own converted content; recursion covers containers nested in containers.
function convertWrappers(items: unknown[], titleKey: string, ctx: NavContext): SitemapNode[] {
  const out: SitemapNode[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const raw = obj[titleKey];
    const title = typeof raw === "string" ? raw : null;
    const children = navToSitemap(obj, ctx);
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
      const children = convertEntries(Array.isArray(obj.pages) ? obj.pages : [], ctx);
      // A group's `root` is its own landing page; docolin nodes are url XOR
      // children, so it leads the group as its first leaf.
      if (typeof obj.root === "string") {
        const rootNode = pageNode(obj.root, ctx);
        if (rootNode !== null) children.unshift(rootNode);
      }
      // Drop a group that resolves to nothing (e.g. an OpenAPI-only group whose
      // every page is a generated endpoint).
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
