import { and, desc, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";
import { db } from "$lib/server/db";
import { stamps, versions, users } from "$lib/server/db/schema";
import {
  competenceWeightFromHistory,
  summarizeStamps,
  type VoterHistoryRow,
} from "./recompute-core";

// Track records: each voter's historical stamps next to where those versions'
// displayed scores settled, excluding the version being recomputed (a stamp
// must never vouch for itself). One query for all of this version's voters;
// stateless, so a consensus shift re-judges everyone on the next recompute.
async function voterCompetence(
  voterIds: string[],
  excludeVersionId: string,
): Promise<Map<string, number>> {
  if (voterIds.length === 0) return new Map();
  const history = await db
    .select({
      id: stamps.id,
      voterUserId: stamps.voterUserId,
      versionId: stamps.versionId,
      outcome: stamps.outcome,
      createdAt: stamps.createdAt,
      retractsStampId: stamps.retractsStampId,
      versionScore: versions.verificationScore,
    })
    .from(stamps)
    .innerJoin(versions, eq(versions.id, stamps.versionId))
    .where(
      and(
        inArray(stamps.voterUserId, voterIds),
        ne(stamps.versionId, excludeVersionId),
        isNotNull(versions.verificationScore),
      ),
    );

  const retractedTargets = new Set(
    history.map((row) => row.retractsStampId).filter((id): id is string => id !== null),
  );

  // Reduce to each voter's LATEST action per version FIRST, with retraction rows
  // included as candidates so a take-back can be the newest action, then drop the
  // take-backs. This order matters and mirrors summarizeStamps: filtering before
  // the reduction would resurrect a superseded vote when the voter retracts a
  // newer one (worked -> didnt_work -> retract must count as nothing, not
  // "worked"). Without the reduction a voter who changed their mind N times would
  // otherwise have N entries in their own track record.
  const latest = new Map<string, (typeof history)[number]>();
  for (const row of history) {
    if (row.voterUserId === null) continue;
    const key = `${row.voterUserId}:${row.versionId}`;
    const existing = latest.get(key);
    if (existing === undefined || row.createdAt > existing.createdAt) latest.set(key, row);
  }

  const byVoter = new Map<string, VoterHistoryRow[]>();
  for (const row of latest.values()) {
    if (row.voterUserId === null || row.versionScore === null) continue;
    // A take-back (or the stamp it cancels) counts for nothing.
    if (row.retractsStampId !== null || retractedTargets.has(row.id)) continue;
    const list = byVoter.get(row.voterUserId) ?? [];
    list.push({ outcome: row.outcome, versionScore: row.versionScore });
    byVoter.set(row.voterUserId, list);
  }
  return new Map(
    [...byVoter.entries()].map(([id, rows]) => [id, competenceWeightFromHistory(rows)]),
  );
}

// Recomputes a guide version's cached verification aggregate from the stamps
// ledger and writes it back onto the version. Runs OFF the write path: call it
// via waitUntil after a stamp lands, or from the periodic recompute job, never
// inline in a read. Reads are served the cached columns.
export async function recomputeVersionScore(versionId: string): Promise<void> {
  const target = (
    await db
      .select({ docoId: versions.docoId, versionNumber: versions.versionNumber })
      .from(versions)
      .where(eq(versions.id, versionId))
      .limit(1)
  ).at(0);
  if (target === undefined) return;

  // The ranking estimate inherits the immediately-preceding version's decayed
  // estimate as its prior, so a fresh version keeps the lineage's standing
  // instead of dropping to zero (verification 4.8). A first version finds no
  // predecessor and falls back to the global prior.
  const previous = (
    await db
      .select({ rankingScore: versions.verificationRankingScore })
      .from(versions)
      .where(
        and(eq(versions.docoId, target.docoId), lt(versions.versionNumber, target.versionNumber)),
      )
      .orderBy(desc(versions.versionNumber))
      .limit(1)
  ).at(0);
  const previousRankingScore = previous?.rankingScore ?? null;

  const rows = await db
    .select({
      id: stamps.id,
      outcome: stamps.outcome,
      source: stamps.source,
      voterUserId: stamps.voterUserId,
      clusterId: stamps.clusterId,
      networkBucket: stamps.networkBucket,
      createdAt: stamps.createdAt,
      voterCreatedAt: users.createdAt,
      retractsStampId: stamps.retractsStampId,
    })
    .from(stamps)
    .leftJoin(users, eq(users.id, stamps.voterUserId))
    .where(eq(stamps.versionId, versionId));

  const competenceByVoter = await voterCompetence(
    [...new Set(rows.map((r) => r.voterUserId).filter((id): id is string => id !== null))],
    versionId,
  );
  const summary = summarizeStamps(rows, new Date(), previousRankingScore, competenceByVoter);

  await db
    .update(versions)
    .set({
      verificationScore: summary.score,
      verificationRankingScore: summary.rankingScore,
      verificationStampCount: summary.stampCount,
      verificationLastConfirmedAt: summary.lastConfirmedAt,
      verificationComputedAt: new Date(),
    })
    .where(eq(versions.id, versionId));
}
