import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { stamps, versions, users } from "$lib/server/db/schema";
import { summarizeStamps } from "./recompute-core";

// Recomputes a guide version's cached verification aggregate from the stamps
// ledger and writes it back onto the version. Runs OFF the write path: call it
// via waitUntil after a stamp lands, or from the periodic recompute job, never
// inline in a read. Reads are served the cached columns.
export async function recomputeVersionScore(versionId: string): Promise<void> {
  const rows = await db
    .select({
      id: stamps.id,
      outcome: stamps.outcome,
      source: stamps.source,
      voterUserId: stamps.voterUserId,
      clusterId: stamps.clusterId,
      createdAt: stamps.createdAt,
      voterCreatedAt: users.createdAt,
    })
    .from(stamps)
    .leftJoin(users, eq(users.id, stamps.voterUserId))
    .where(eq(stamps.versionId, versionId));

  const summary = summarizeStamps(rows, new Date());

  await db
    .update(versions)
    .set({
      verificationScore: summary.score,
      verificationStampCount: summary.stampCount,
      verificationLastConfirmedAt: summary.lastConfirmedAt,
      verificationComputedAt: new Date(),
    })
    .where(eq(versions.id, versionId));
}
