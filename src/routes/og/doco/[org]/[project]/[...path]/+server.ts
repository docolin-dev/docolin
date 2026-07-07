import type { RequestHandler } from "./$types";
import { docoCardSpec } from "$lib/og/resolve";
import { ogImageResponse } from "$lib/og/endpoint";

// OG card for a doco, addressed by the same URL parts as the viewer
// (/{org}/{project}/{path}). Re-derives the card fields server-side so the
// image is always in sync with the doco; the PNG is edge-cached and refreshed
// by the sync purge.
export const GET: RequestHandler = async (event) => {
  const { org, project, path } = event.params;
  const spec = await docoCardSpec(org, project, path);
  return ogImageResponse(event, spec);
};
