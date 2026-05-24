// Pure transform from raw stamp ledger rows to a version's cached aggregate.
// No DB, no I/O, so it is unit-testable in isolation; the DB query and write
// live in recompute.ts. Turns rows into the scoring inputs (deduping each
// voter's latest stamp and deriving weights), runs the scoring core, and rolls
// up the count and last-confirmed timestamp.

import { computeScore, type ScoringStamp, type StampOutcome } from "./score";
import { computePersonWeight, DEFAULT_BASE_WEIGHT, type StampSource } from "./weights";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * A stamp row joined to its voter, the raw input to a recompute.
 * `voterCreatedAt` (the voter account's creation time, for the person weight) is
 * null for anonymous stamps or a deleted voter.
 */
export interface StampRow {
  id: string;
  outcome: StampOutcome;
  source: StampSource;
  voterUserId: string | null;
  clusterId: string | null;
  createdAt: Date;
  voterCreatedAt: Date | null;
}

export interface StampSummary {
  /** 0-1000 reliability score, or null when below the display gate. */
  score: number | null;
  /** Stamps behind the score, deduped to each voter's latest. */
  stampCount: number;
  /** Most recent worked / worked-with-caveats stamp, for "last confirmed". */
  lastConfirmedAt: Date | null;
  /** Diversity- and freshness-adjusted evidence weight (the gate input). */
  effectiveWeight: number;
}

export function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / MS_PER_DAY;
}

// Keeps each signed-in voter's latest stamp (a later stamp supersedes an earlier
// one on the same version, so repeated stamping cannot multiply a voter's
// weight) and keeps every anonymous stamp (no identity to dedupe on; correlated
// anonymous bursts are handled by clustering instead).
function dedupeLatestPerVoter(rows: StampRow[]): StampRow[] {
  const latestByVoter = new Map<string, StampRow>();
  const anonymous: StampRow[] = [];
  for (const row of rows) {
    if (row.voterUserId === null) {
      anonymous.push(row);
      continue;
    }
    const existing = latestByVoter.get(row.voterUserId);
    if (existing === undefined || row.createdAt > existing.createdAt) {
      latestByVoter.set(row.voterUserId, row);
    }
  }
  return [...latestByVoter.values(), ...anonymous];
}

function toScoringStamp(row: StampRow, now: Date): ScoringStamp {
  // Anonymous (or a deleted voter whose id was nulled) gets no person boost; it
  // rides on its tiny source base weight alone.
  const personWeight =
    row.voterUserId !== null && row.voterCreatedAt !== null
      ? computePersonWeight({
          accountAgeDays: daysBetween(row.voterCreatedAt, now),
          hasPasskey: false,
        })
      : 1;
  return {
    outcome: row.outcome,
    baseWeight: DEFAULT_BASE_WEIGHT[row.source],
    personWeight,
    // Competence is neutral until track records exist; wired here so it sharpens
    // later without touching the scorer.
    competenceWeight: 1,
    ageDays: daysBetween(row.createdAt, now),
    // Uncorrelated stamps each form their own singleton cluster (no collapse)
    // until the anti-abuse detector assigns shared cluster ids.
    clusterId: row.clusterId ?? row.id,
  };
}

/** Rolls a version's raw stamp rows up into its cached aggregate. */
export function summarizeStamps(rows: StampRow[], now: Date = new Date()): StampSummary {
  const kept = dedupeLatestPerVoter(rows);
  const result = computeScore(kept.map((row) => toScoringStamp(row, now)));

  let lastConfirmedAt: Date | null = null;
  for (const row of kept) {
    if (row.outcome === "didnt_work") continue;
    if (lastConfirmedAt === null || row.createdAt > lastConfirmedAt) {
      lastConfirmedAt = row.createdAt;
    }
  }

  return {
    score: result.status === "verified" ? result.score : null,
    stampCount: kept.length,
    lastConfirmedAt,
    effectiveWeight: result.effectiveWeight,
  };
}
