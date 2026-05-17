import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { localizeHref } from "$paraglide/runtime";

// Auth guard for every /dashboard/* route. Anonymous visitors get bounced to
// sign-in with returnTo set; WorkOS-authed-but-not-onboarded visitors get
// bounced to onboarding (which itself will redirect back here once they
// finish). Layout-level so individual pages don't repeat the check.
export const load: LayoutServerLoad = ({ locals, url }) => {
  if (!locals.auth.user) {
    redirect(302, localizeHref(`/signin?returnTo=${encodeURIComponent(url.pathname)}`));
  }
  if (!locals.dbUser) {
    redirect(302, localizeHref(`/onboarding?returnTo=${encodeURIComponent(url.pathname)}`));
  }
  return {};
};
