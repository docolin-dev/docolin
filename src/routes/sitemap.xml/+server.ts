import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import {
  discussions,
  docos,
  gitSources,
  latestVersions,
  orgs,
  projects,
} from "$lib/server/db/schema";
import { fromLtree } from "$lib/server/db/schema/types";
import { discussionRef, pathFromSourcePath } from "$lib/doco-urls";
import { SITE_URL } from "$lib/site";
import { baseLocale, locales } from "$paraglide/runtime";

// Dynamic sitemap: marketing pages, every kind browse page with content, every
// live doco (canonical, unversioned URL), and every visible discussion thread.
// Each URL is listed once per locale. One flat sitemap is fine far past the
// current scale (the format caps at 50k URLs); split into an index then.
//
// Edge-cached for an hour: crawlers poll slowly, and a new doco missing from
// the sitemap for under an hour costs nothing (it is also discoverable through
// the kind pages and search).
const CACHE = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

// Marketing + top-level surfaces worth crawling. Auth/dashboard are noindex.
const STATIC_PATHS = [
  "/",
  "/browse",
  "/search",
  "/about",
  "/mcp",
  "/for-projects",
  "/compare",
  "/sponsor",
  "/terms",
];

function xmlEscape(value: string): string {
  return value
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;");
}

interface SitemapEntry {
  path: string;
  lastmod?: string;
}

function urlElement(entry: SitemapEntry, localePrefix: string): string {
  const loc = xmlEscape(`${SITE_URL}${localePrefix}${entry.path}`);
  const lastmod = entry.lastmod === undefined ? "" : `<lastmod>${entry.lastmod}</lastmod>`;
  return `<url><loc>${loc}</loc>${lastmod}</url>`;
}

export const GET: RequestHandler = async ({ setHeaders }) => {
  setHeaders({ "cache-control": CACHE });

  const [docoRows, kindRows, discussionRows] = await Promise.all([
    db
      .select({
        pathInSource: docos.pathInSource,
        subpath: gitSources.subpath,
        orgSlug: orgs.slug,
        projectSlug: projects.slug,
        publishedAt: latestVersions.publishedAt,
      })
      .from(latestVersions)
      .innerJoin(docos, and(eq(docos.id, latestVersions.docoId), isNull(docos.deletedAt)))
      .innerJoin(projects, eq(projects.id, docos.projectId))
      .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
      .leftJoin(gitSources, eq(gitSources.projectId, projects.id)),
    db.selectDistinct({ kind: latestVersions.kind }).from(latestVersions),
    db
      .select({
        number: discussions.number,
        title: discussions.title,
        updatedAt: discussions.updatedAt,
        pathInSource: docos.pathInSource,
        subpath: gitSources.subpath,
        orgSlug: orgs.slug,
        projectSlug: projects.slug,
      })
      .from(discussions)
      .innerJoin(docos, and(eq(docos.id, discussions.docoId), isNull(docos.deletedAt)))
      .innerJoin(projects, eq(projects.id, docos.projectId))
      .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
      .leftJoin(gitSources, eq(gitSources.projectId, projects.id))
      .where(and(isNull(discussions.hiddenAt), isNotNull(docos.latestPublishedVersionId))),
  ]);

  const entries: SitemapEntry[] = STATIC_PATHS.map((path) => ({ path }));

  for (const row of kindRows) {
    entries.push({ path: `/${fromLtree(row.kind)}` });
  }
  for (const row of docoRows) {
    const path = pathFromSourcePath(row.pathInSource ?? "", row.subpath);
    entries.push({
      path: `/${row.orgSlug}/${row.projectSlug}/${path}`,
      lastmod: row.publishedAt.toISOString().slice(0, 10),
    });
  }
  for (const row of discussionRows) {
    const path = pathFromSourcePath(row.pathInSource ?? "", row.subpath);
    entries.push({
      path: `/${row.orgSlug}/${row.projectSlug}/${path}/discussions/${discussionRef(row.number, row.title)}`,
      lastmod: row.updatedAt.toISOString().slice(0, 10),
    });
  }

  const prefixes = locales.map((locale) => (locale === baseLocale ? "" : `/${locale}`));
  const body = entries
    .flatMap((entry) => prefixes.map((prefix) => urlElement(entry, prefix)))
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
