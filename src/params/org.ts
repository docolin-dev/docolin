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
//   - Never-content path roots. OAuth clients (the claude.ai MCP broker
//     among them) probe POST /register and GET /.well-known/oauth-* to
//     decide whether a server requires auth; the authless signal is a clean
//     404. When the org page route caught /register, SvelteKit answered the
//     POST with 405 and the broker read it as a broken sign-in service
//     (anthropics/claude-ai-mcp#262). reserved-handles blocks `register`
//     as a slug; `.well-known` is an RFC 8615 namespace, never content.
const ENDPOINT_ONLY_SEGMENTS = new Set([
  "api",
  "signin",
  "signout",
  "callback",
  "raw",
  "sitemap.xml",
  "robots.txt",
  "register",
  ".well-known",
]);

export const match: ParamMatcher = (param) =>
  !ENDPOINT_ONLY_SEGMENTS.has(param) && !TAXONOMY_ROOTS.has(param);
