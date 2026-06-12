import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getDocoHeader, resolveDocoIdentity, resolveProjectBySlug } from "$lib/server/doco-resolve";
import { listThreads, type ThreadFilter } from "$lib/server/discussions";
import { rebuildPathInSource } from "$lib/doco-urls";

// Per-doco discussion list (the doco's "issues tab"). Public content rendered
// server-side and edge-cached like the doco viewer, so the HTML is identical
// for every reader; the "new discussion" CTA picks signed-in vs sign-in
// client-side from the session store. The `path` rest parameter is the doco's
// path-from-project-root; the static `discussions` segment is consumed by this
// route and wins over the greedy viewer route via SvelteKit specificity.
// Creating happens on the separate `discussions/new` page.

const CACHE_LATEST = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const CACHE_DATA_REQUEST = "private, no-store";

function parseFilter(raw: string | null): ThreadFilter {
  if (raw === "closed") return "closed";
  if (raw === "all") return "all";
  return "open";
}

export const load: PageServerLoad = async ({ params, url, setHeaders, isDataRequest }) => {
  const proj = await resolveProjectBySlug(params.org, params.project);
  if (proj === null) error(404);
  const expectedPathInSource = rebuildPathInSource(params.path, proj.subpath);
  const docoIdRow = await resolveDocoIdentity(proj.gitSourceId, expectedPathInSource);
  if (docoIdRow === null) error(404);

  setHeaders({ "cache-control": isDataRequest ? CACHE_DATA_REQUEST : CACHE_LATEST });

  const filter = parseFilter(url.searchParams.get("status"));

  // Doco title + kind for the page's context header and navbar breadcrumb.
  const header = await getDocoHeader(docoIdRow.latestPublishedVersionId);

  const threads = await listThreads(docoIdRow.docoId, filter);

  return {
    org: { slug: proj.orgSlug, displayName: proj.orgDisplayName },
    project: { slug: proj.projectSlug, displayName: proj.projectDisplayName },
    docoPath: params.path,
    docoTitle: header.title ?? params.path,
    kindSegments: header.kindSegments,
    status: filter,
    threads,
  };
};
