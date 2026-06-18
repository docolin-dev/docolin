import { error, json } from "@sveltejs/kit";
import { and, eq, isNull, lt, or, sql, asc } from "drizzle-orm";
import { requireEnv } from "$lib/server/env";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { gitSources, orgs, projects } from "$lib/server/db/schema";
import { purgeOnRendererChange } from "$lib/server/renderer-purge";
import { syncProject } from "$lib/sync/run";

// Cron-triggered sync endpoint. Picks projects with no sync in the last 24h
// (oldest first), processes them sequentially until either the queue is empty
// or the wall-clock budget runs out. Defers the rest to the next tick.
//
// Auth: shared secret in the Authorization header. The scheduler (a CF Cron
// Trigger on a tiny worker, or an external cron-job.org pointer) hits this
// endpoint hourly with `Authorization: Bearer {CRON_SECRET}`.

// Max wall-clock time spent in one tick. Cloudflare Workers cap requests at
// 30 seconds CPU, so leave headroom for the response.
const TICK_BUDGET_MS = 20_000;

// Max projects per tick. Defense against a single tick monopolizing the
// queue if individual syncs are fast.
const MAX_PROJECTS_PER_TICK = 25;

// "Stale" threshold: 24h between syncs is the polling SLA.
const STALE_AFTER_HOURS = 24;

export const POST: RequestHandler = async ({ request, platform }) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${requireEnv("CRON_SECRET")}`) error(401, "unauthorized");

  if (!platform?.env.MEDIA_BUCKET) {
    error(500, "MEDIA_BUCKET binding is not available");
  }
  const bucket = platform.env.MEDIA_BUCKET;

  const startedAt = Date.now();

  // A deploy that changed RENDERER_VERSION needs the edge cache flushed once;
  // every other tick this is a single SELECT. Piggybacks on this cron because
  // it is the most frequent scheduled entry point.
  await purgeOnRendererChange();

  // Eligible: never synced, OR last sync was more than STALE_AFTER_HOURS ago.
  // Ordered by lastSyncedAt ASC NULLS FIRST so brand-new projects (NULL) and
  // long-stale ones bubble to the top of the queue.
  const stale = await db
    .select({
      projectId: projects.id,
    })
    .from(projects)
    .innerJoin(gitSources, eq(gitSources.projectId, projects.id))
    .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
    .where(
      and(
        eq(projects.sourceMode, "git"),
        // Soft-deleted projects never sync; revive (recreate) clears the flag.
        isNull(projects.deletedAt),
        // Frozen projects (their org was soft-deleted) stop syncing too; their
        // docos stay published but de-attributed.
        isNull(orgs.deletedAt),
        or(
          isNull(gitSources.lastSyncedAt),
          lt(
            gitSources.lastSyncedAt,
            sql`now() - interval '${sql.raw(String(STALE_AFTER_HOURS))} hours'`,
          ),
        ),
      ),
    )
    .orderBy(sql`${gitSources.lastSyncedAt} ASC NULLS FIRST`, asc(projects.createdAt))
    .limit(MAX_PROJECTS_PER_TICK);

  const summary: {
    processed: number;
    success: number;
    skipped_no_change: number;
    error: number;
    rate_limited: number;
    deferred: number;
  } = {
    processed: 0,
    success: 0,
    skipped_no_change: 0,
    error: 0,
    rate_limited: 0,
    deferred: 0,
  };

  for (const row of stale) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) {
      summary.deferred = stale.length - summary.processed;
      break;
    }
    const result = await syncProject(row.projectId, bucket);
    summary.processed += 1;
    if (result.status === "success") summary.success += 1;
    else if (result.status === "skipped_no_change") summary.skipped_no_change += 1;
    else if (result.status === "error" || result.status === "not_found") summary.error += 1;
    else {
      // result.status === "rate_limited" by elimination.
      summary.rate_limited += 1;
      // GitHub said back off. Don't keep hammering it inside the same tick.
      break;
    }
  }

  return json(summary);
};
