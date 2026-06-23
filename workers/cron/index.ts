// Cron worker. CF fires `scheduled()` on the schedule declared in wrangler.toml;
// that handler calls the docolin app's /api/cron/* endpoints with the shared
// secret. It also consumes the sync queue: `queue()` turns each { gitSourceId }
// message into one drain chunk on the app (/api/sync/drain), which re-enqueues
// itself while work remains. All real logic lives in the main app; keeping this
// worker dumb means we don't duplicate code or have two places to update.

import type { ScheduledEvent, ExecutionContext, MessageBatch } from "@cloudflare/workers-types";

interface Env {
  DOCOLIN_BASE_URL: string;
  CRON_SECRET: string;
}

// Body of a sync-queue message (mirrors src/lib/sync/queue.ts in the main app):
// which git source to drain. The job state itself lives in the sync_jobs row.
interface SyncQueueMessage {
  gitSourceId: string;
}

// The cron jobs fired each tick. sync pulls fresh content; recompute-scores
// refreshes Pango scores from the stamps ledger; embed-versions fills in the
// dense search vectors for newly latest versions.
const CRON_PATHS = ["/api/cron/sync", "/api/cron/recompute-scores", "/api/cron/embed-versions"];

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.allSettled(CRON_PATHS.map((path) => triggerCron(env, path))));
  },

  // One message = one git source to drain. Fire a single chunk via /api/sync/drain;
  // the app re-enqueues a follow-up message itself while work remains, so we just
  // trigger and ack. A failed delivery is retried (backoff, then dead-letter queue).
  async queue(batch: MessageBatch<SyncQueueMessage>, env: Env): Promise<void> {
    // Dedupe within the batch: the lease serializes duplicates anyway, but there
    // is no point hitting /drain twice for the same source in one batch.
    const seen = new Set<string>();
    for (const message of batch.messages) {
      const { gitSourceId } = message.body;
      if (seen.has(gitSourceId)) {
        message.ack();
        continue;
      }
      seen.add(gitSourceId);
      if (await drainOne(env, gitSourceId)) message.ack();
      else message.retry();
    }
  },
};

async function triggerCron(env: Env, path: string): Promise<void> {
  const url = `${env.DOCOLIN_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
    });
  } catch (err) {
    console.error(
      `cron: fetch ${url} threw: ${err instanceof Error ? err.message : "unknown error"}`,
    );
    return;
  }

  if (!res.ok) {
    const body = await safeText(res);
    console.error(`cron: ${url} returned ${String(res.status)} ${res.statusText}: ${body}`);
    return;
  }

  const body = await safeText(res);
  console.log(`cron: ${url} OK: ${body}`);
}

// Triggers one drain chunk on the main app. Returns whether the call succeeded;
// the app itself re-enqueues a follow-up message while work remains, so we only
// need to fire one chunk and report delivery so the queue can retry on failure.
async function drainOne(env: Env, gitSourceId: string): Promise<boolean> {
  const url = `${env.DOCOLIN_BASE_URL}/api/sync/drain`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ gitSourceId }),
    });
  } catch (err) {
    console.error(
      `queue: drain ${gitSourceId} threw: ${err instanceof Error ? err.message : "unknown error"}`,
    );
    return false;
  }
  if (!res.ok) {
    const body = await safeText(res);
    console.error(`queue: drain ${gitSourceId} returned ${String(res.status)}: ${body}`);
    return false;
  }
  return true;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
