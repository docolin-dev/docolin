import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getProfile } from "$lib/server/profile";

// Public profile page for /{slug}: a user (every author byline links here) or
// an org. Same cache posture as the other public shells: identical HTML for
// every reader, short edge TTL with a long SWR window since nothing purges
// profile URLs on write (a new doco or stamp shows up within s-maxage).
const CACHE_LATEST = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const CACHE_DATA_REQUEST = "private, no-store";

export const load: PageServerLoad = async ({ params, setHeaders, isDataRequest }) => {
  const profile = await getProfile(params.org);
  if (profile === null) error(404);

  setHeaders({ "cache-control": isDataRequest ? CACHE_DATA_REQUEST : CACHE_LATEST });

  return { profile };
};
