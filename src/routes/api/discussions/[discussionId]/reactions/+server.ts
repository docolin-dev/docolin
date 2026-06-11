import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getViewerReactions } from "$lib/server/reactions";

// The viewer's own reactions in one thread. Split out from the (cached,
// public) thread page like the capabilities route: counts live in the shared
// HTML, which chips are *yours* hydrates per user from here.
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
  setHeaders({ "cache-control": "private, no-store" });

  if (!locals.dbUser) return json({ mine: [] });
  const mine = await getViewerReactions(params.discussionId, locals.dbUser.id);
  return json({ mine });
};
