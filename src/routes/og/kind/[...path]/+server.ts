import type { RequestHandler } from "./$types";
import { kindCardSpec } from "$lib/og/resolve";
import { ogImageResponse } from "$lib/og/endpoint";

// OG card for a kind (topic) browse page, addressed by its kind path.
export const GET: RequestHandler = async (event) => {
  const spec = await kindCardSpec(event.params.path);
  return ogImageResponse(event, spec);
};
