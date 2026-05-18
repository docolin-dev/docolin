import type { PageServerLoad } from "./$types";

// Edge-cacheable shell for /dashboard/[org]. Per-user data (org details,
// project list, member count) loads client-side from /api/dashboard/orgs/[org]
// after hydration. One cached HTML per org slug; per-user membership check
// runs in the API endpoint.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=300, s-maxage=2592000, stale-while-revalidate=604800",
  });
  return {};
};
