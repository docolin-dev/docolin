// Cron worker. CF fires `scheduled()` on the schedule declared in wrangler.toml;
// this handler just calls the docolin app's /api/cron/sync endpoint with the
// shared secret. All sync logic lives in the main app — keeping the worker
// dumb means we don't duplicate the orchestrator code or have two places to
// update when sync changes.

import type { ScheduledEvent, ExecutionContext } from "@cloudflare/workers-types";

interface Env {
  DOCOLIN_BASE_URL: string;
  CRON_SECRET: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(triggerSync(env));
  },
};

async function triggerSync(env: Env): Promise<void> {
  const url = `${env.DOCOLIN_BASE_URL}/api/cron/sync`;
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

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
