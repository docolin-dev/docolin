import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { verifyForgeRepo } from "$lib/server/repo-check";

// Live reachability check for a repo URL on the project-create form. The
// provider (GitHub or Codeberg) is detected from the URL host; the same
// verifier runs again server-side on submit as the authoritative guard.
// Route name kept for the existing form integration despite outgrowing the
// "github-" prefix.
export const GET: RequestHandler = async ({ url, locals, setHeaders }) => {
  // Auth gate: only signed-in + onboarded users hit this. No need to leak
  // the endpoint to anonymous traffic.
  if (!locals.dbUser) error(404);

  // Per-user request (auth-gated) and hits the forge live; never cache.
  setHeaders({ "cache-control": "private, no-store" });

  const repoUrl = url.searchParams.get("url") ?? "";
  return json(await verifyForgeRepo(repoUrl));
};
