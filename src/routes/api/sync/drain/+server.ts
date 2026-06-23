import { error, json } from "@sveltejs/kit";
import { requireEnv } from "$lib/server/env";
import type { RequestHandler } from "./$types";
import { drainSyncJob } from "$lib/sync/job";

// Internal endpoint: drains one bounded chunk of a sync job, then self-kicks if
// work remains. Called by enqueueSync's kick and the cron backstop, never by a
// user. Auth is the shared CRON_SECRET, same as /api/cron/sync.
export const POST: RequestHandler = async ({ request, platform, url }) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${requireEnv("CRON_SECRET")}`) error(401, "unauthorized");
  if (!platform?.env.MEDIA_BUCKET) error(500, "MEDIA_BUCKET binding is not available");

  const body = (await request.json().catch(() => null)) as { gitSourceId?: unknown } | null;
  const gitSourceId = body?.gitSourceId;
  if (typeof gitSourceId !== "string") error(400, "gitSourceId required");

  await drainSyncJob(
    gitSourceId,
    platform.env.MEDIA_BUCKET,
    url.origin,
    platform.context.waitUntil.bind(platform.context),
  );
  return json({ ok: true });
};
