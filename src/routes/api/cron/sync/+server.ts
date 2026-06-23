import { error, json } from "@sveltejs/kit";
import { and, eq, isNull, lt, or, sql, asc } from "drizzle-orm";
import { requireEnv } from "$lib/server/env";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { gitSources, orgs, projects } from "$lib/server/db/schema";
import { purgeOnRendererChange } from "$lib/server/renderer-purge";
import { enqueueSync, reclaimStalledJobs } from "$lib/sync/job";

// Cron-triggered sync driver. It no longer runs syncs inline: it (1) reclaims any
// sync_jobs whose lease lapsed (a worker that crashed mid-chunk, or a dropped
// queue message) by re-enqueueing them, and (2) enqueues a sync for every project
// that hasn't synced within the polling SLA. The work happens in the drain
// endpoint, chunk by chunk, so no single cron invocation does heavy sync work.
//
// Auth: shared CRON_SECRET in the Authorization header. The cron worker hits this
// every 15 minutes.

// Max stalled jobs reclaimed per tick (each re-enqueues a queue message).
const MAX_RECLAIM_PER_TICK = 50;
// Max stale projects enqueued per tick.
const MAX_PROJECTS_PER_TICK = 50;
// "Stale" threshold: 24h between syncs is the polling SLA.
const STALE_AFTER_HOURS = 24;

export const POST: RequestHandler = async ({ request, platform }) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${requireEnv("CRON_SECRET")}`) error(401, "unauthorized");
  if (!platform?.env.SYNC_QUEUE) error(500, "SYNC_QUEUE binding is not available");

  const queue = platform.env.SYNC_QUEUE;

  // A deploy that changed RENDERER_VERSION needs the edge cache flushed once;
  // every other tick this is a single SELECT. Piggybacks on this cron because it
  // is the most frequent scheduled entry point.
  await purgeOnRendererChange();

  // 1. Reclaim stalled / crashed jobs by re-enqueueing them on the sync queue.
  const reclaimed = await reclaimStalledJobs(queue, MAX_RECLAIM_PER_TICK);

  // 2. Schedule stale projects (never synced, or beyond the polling SLA). Oldest
  // first so new and long-stale projects bubble up; enqueueSync collapses onto any
  // existing job and kicks the drain.
  const stale = await db
    .select({ projectId: projects.id })
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

  for (const row of stale) {
    await enqueueSync(row.projectId, { queue, bucket: platform.env.MEDIA_BUCKET });
  }

  return json({ reclaimed, scheduled: stale.length });
};
