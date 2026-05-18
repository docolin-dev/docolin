import type { PageServerLoad } from "./$types";

// Marketing home. No per-user content, no per-request data. Cache aggressively
// at the edge so cold traffic doesn't bounce through a function invocation.
// CF Pages purges the cache on every project deploy, so we don't need active
// purge wiring here; the long s-maxage rebuilds on the first post-deploy hit.
//
// Browser caches modestly (5 min) so authors editing this surface see their
// own change soon after a deploy without a hard refresh; the edge tier carries
// the real cache weight.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=300, s-maxage=2592000, stale-while-revalidate=604800",
  });
  return {};
};
