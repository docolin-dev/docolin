import { error, json } from "@sveltejs/kit";
import { requireEnv } from "$lib/server/env";
import type { RequestHandler } from "./$types";
import { drainSyncJob } from "$lib/sync/job";

// Internal endpoint: drains one bounded chunk of a sync job and reports whether
// more remains. The docolin-cron queue consumer calls this once per message; when
// work remains we re-enqueue a follow-up message so the next chunk runs in a fresh
// invocation (reliable, in-request, never a dropped waitUntil self-fetch). Auth is
// the shared CRON_SECRET, same as /api/cron/sync. Never called by a user.
export const POST: RequestHandler = async ({ request, platform }) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${requireEnv("CRON_SECRET")}`) error(401, "unauthorized");
  if (!platform?.env.MEDIA_BUCKET) error(500, "MEDIA_BUCKET binding is not available");

  const body = (await request.json().catch(() => null)) as { gitSourceId?: unknown } | null;
  const gitSourceId = body?.gitSourceId;
  if (typeof gitSourceId !== "string") error(400, "gitSourceId required");

  const { more } = await drainSyncJob(gitSourceId, platform.env.MEDIA_BUCKET);
  if (more) await platform.env.SYNC_QUEUE.send({ gitSourceId });
  return json({ more });
};
