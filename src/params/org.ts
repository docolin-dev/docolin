import type { ParamMatcher } from "@sveltejs/kit";
import { TAXONOMY_ROOTS } from "$lib/reserved-handles";

// Matches a first URL segment that can actually be an org/user slug. Two
// classes are structurally excluded:
//
//   - Endpoint-only routes (signin, signout, ...). They have no page
//     component, so without this matcher the CLIENT router would route a
//     clicked link to the profile page (which 404s) instead of falling
//     through to a full navigation that reaches the endpoint. The server
//     never had the problem (static routes win there), which is why curl
//     checks looked fine while clicking "Sign in" broke.
//   - Taxonomy roots, which belong to the kind browse route (see kind.ts);
//     reserved-handles guarantees they can never be real org slugs.
const ENDPOINT_ONLY_SEGMENTS = new Set([
  "api",
  "signin",
  "signout",
  "callback",
  "raw",
  "sitemap.xml",
  "robots.txt",
]);

export const match: ParamMatcher = (param) =>
  !ENDPOINT_ONLY_SEGMENTS.has(param) && !TAXONOMY_ROOTS.has(param);
