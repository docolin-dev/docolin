import { error, json } from "@sveltejs/kit";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { requireEnv } from "$lib/server/env";
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
  if (auth !== `Bearer ${requireEnv("CRON_SECRET")}`) error(401, "unauthorized");

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

  // Latest versions that have never been scored (just published with no stamps
  // yet, or pre-dating the ranking column) so their inherited ranking prior
  // lands without waiting for a first stamp. recomputeVersionScore on a
  // stampless version writes its inherited estimate and leaves the gated badge
  // null, so once scored it drops out of this set.
  const unseeded = await db
    .select({ versionId: versions.id })
    .from(versions)
    .where(and(eq(versions.isLatest, true), isNull(versions.verificationRankingScore)))
    .limit(MAX_VERSIONS_PER_TICK);

  const versionIds = [...new Set([...dirty, ...unseeded].map((r) => r.versionId))];

  const startedAt = Date.now();
  const summary = { processed: 0, deferred: 0 };
  for (const versionId of versionIds) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) {
      summary.deferred = versionIds.length - summary.processed;
      break;
    }
    await recomputeVersionScore(versionId);
    summary.processed += 1;
  }

  return json(summary);
};
