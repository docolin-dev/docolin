import { redirect } from "@sveltejs/kit";
import { localizeHref } from "$paraglide/runtime";
import type { PageServerLoad } from "./$types";

// The privacy policy is a doco (versioned, discussable). This short URL forwards
// there so /privacy stays a well-known entry point. Temporary (307) while
// pre-alpha; promote to 308 at launch. See the matching /terms redirect.
export const load: PageServerLoad = () => {
  redirect(307, localizeHref("/docolin/docolin/privacy"));
};
