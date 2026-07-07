import type { RequestHandler } from "./$types";
import { profileCardSpec } from "$lib/og/resolve";
import { ogImageResponse } from "$lib/og/endpoint";

// OG card for a public profile at /{slug} (a user or an org).
export const GET: RequestHandler = async (event) => {
  const spec = await profileCardSpec(event.params.slug);
  return ogImageResponse(event, spec);
};
