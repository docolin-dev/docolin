import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { localizeHref } from "$paraglide/runtime";

// `/dashboard/{org}/projects` exists only as an intermediate breadcrumb
// segment of `/dashboard/{org}/projects/new`. Bounce visitors who land
// here to the org page so the clickable crumb doesn't 404.
//
// Same redirect target for every reader of a given org slug, so cache long.
export const load: PageServerLoad = ({ params, setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=86400, s-maxage=2592000",
  });
  redirect(302, localizeHref(`/dashboard/${params.org}`));
};
