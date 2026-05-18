import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { localizeHref } from "$paraglide/runtime";

// `/dashboard/orgs` exists as an intermediate breadcrumb segment of
// `/dashboard/orgs/new`, but it has no page of its own. Bounce visitors who
// land here to the dashboard so the clickable crumb doesn't 404.
//
// The redirect target is the same for every reader, so cache long at the
// edge to avoid spending a function invocation on this pure bouncer.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=86400, s-maxage=2592000",
  });
  redirect(302, localizeHref("/dashboard"));
};
