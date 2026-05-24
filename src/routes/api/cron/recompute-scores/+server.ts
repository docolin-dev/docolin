import { error, json } from "@sveltejs/kit";
import { eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { CRON_SECRET } from "$env/static/private";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { stamps, versions } from "$lib/server/db/schema";
import { recomputeVersionScore } from "$lib/verification/recompute";

// Cron-triggered Pango Score recompute. The stamp write is a single insert and
// never recomputes inline; this job picks up versions that need it and coalesces
// a burst of stamps on the same version into one recompute.
//
// A version is recomputed when it has a stamp newer than its last recompute, or
// when it hasn't been refreshed in a while (so freshness decay keeps moving even
// without new stamps). Versions with no stamps never appear (nothing to score).
//
// Auth: shared secret in the Authorization header, same as /api/cron/sync. The
// scheduler hits this with `Authorization: Bearer {CRON_SECRET}`.

const TICK_BUDGET_MS = 20_000;
const MAX_VERSIONS_PER_TICK = 200;
// Refresh a version at least this often so time decay stays current between stamps.
const DECAY_REFRESH_HOURS = 168; // 7 days

export const POST: RequestHandler = async ({ request }) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) error(401, "unauthorized");

  const dirty = await db
    .selectDistinct({ versionId: stamps.versionId })
    .from(stamps)
    .innerJoin(versions, eq(versions.id, stamps.versionId))
    .where(
      or(
        isNull(versions.verificationComputedAt),
        gt(stamps.createdAt, versions.verificationComputedAt),
        lt(
          versions.verificationComputedAt,
          sql`now() - interval '${sql.raw(String(DECAY_REFRESH_HOURS))} hours'`,
        ),
      ),
    )
    .limit(MAX_VERSIONS_PER_TICK);

  const startedAt = Date.now();
  const summary = { processed: 0, deferred: 0 };
  for (const row of dirty) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) {
      summary.deferred = dirty.length - summary.processed;
      break;
    }
    await recomputeVersionScore(row.versionId);
    summary.processed += 1;
  }

  return json(summary);
};
