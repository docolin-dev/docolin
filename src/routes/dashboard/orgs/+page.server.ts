import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { localizeHref } from "$paraglide/runtime";

// `/dashboard/orgs` exists as an intermediate breadcrumb segment of
// `/dashboard/orgs/new`, but it has no page of its own. Bounce visitors who
// land here to the dashboard so the clickable crumb doesn't 404.
export const load: PageServerLoad = () => {
  redirect(302, localizeHref("/dashboard"));
};
