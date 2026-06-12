import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { dev } from "$app/environment";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { versions } from "$lib/server/db/schema";
import { fromLtree } from "$lib/server/db/schema/types";
import { resolveDocoIdentity, resolveProjectBySlug } from "$lib/server/doco-resolve";
import { rebuildPathInSource } from "$lib/doco-urls";

// Title + description for an internal doco link, driving the link hovercards in the
// doco viewer. Public metadata (the rendered page is already public), so the response
// is edge-cacheable like the page itself.
export interface DocoPreview {
  title: string;
  description: string | null;
  kind: string;
}

// Latest-version metadata is mutable-but-cacheable: revalidate in the browser, cache
// a day at the edge, serve stale for a week while refreshing (same shape as the page).
const CACHE_PREVIEW = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

export const GET: RequestHandler = async ({ url, setHeaders }) => {
  const target = url.searchParams.get("url");
  if (!target?.startsWith("/")) error(400);
  const parts = target
    .slice(1)
    .split("/")
    .filter((part) => part.length > 0);
  // A doco link is /{org}/{project}/{path}; anything shorter isn't one.
  if (parts.length < 3) error(404);
  const [orgSlug, projectSlug, ...rest] = parts;
  const path = rest.join("/");

  // Dev playground: resolve from the local pango registry (never in the database).
  if (dev && orgSlug === "pangos" && projectSlug === "jungle-gym") {
    const { PANGO_PAGES } = await import("../../[org=org]/[project]/[...path]/pango/pages.ts");
    const page = PANGO_PAGES.find((candidate) => candidate.slug === path);
    if (page === undefined) error(404);
    setHeaders({ "cache-control": "no-store" });
    return json({
      title: page.title,
      description: page.description,
      kind: "pango/jungle-gym",
    } satisfies DocoPreview);
  }

  const proj = await resolveProjectBySlug(orgSlug, projectSlug);
  if (proj === null) error(404);
  const idRow = await resolveDocoIdentity(
    proj.gitSourceId,
    rebuildPathInSource(path, proj.subpath),
  );
  const versionId = idRow?.latestPublishedVersionId ?? null;
  if (versionId === null) error(404);

  const rows = await db
    .select({ title: versions.title, description: versions.description, kind: versions.kind })
    .from(versions)
    .where(eq(versions.id, versionId))
    .limit(1);
  if (rows.length === 0) error(404);

  setHeaders({ "cache-control": CACHE_PREVIEW });
  return json({
    title: rows[0].title,
    description: rows[0].description,
    kind: fromLtree(rows[0].kind),
  } satisfies DocoPreview);
};
