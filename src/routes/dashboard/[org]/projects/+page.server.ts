import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { localizeHref } from "$paraglide/runtime";

// `/dashboard/{org}/projects` exists only as an intermediate breadcrumb
// segment of `/dashboard/{org}/projects/new`. Bounce visitors who land
// here to the org page so the clickable crumb doesn't 404.
export const load: PageServerLoad = ({ params }) => {
  redirect(302, localizeHref(`/dashboard/${params.org}`));
};
