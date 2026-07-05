// Pure transform from raw stamp ledger rows to a version's cached aggregate.
// No DB, no I/O, so it is unit-testable in isolation; the DB query and write
// live in recompute.ts. Turns rows into the scoring inputs (deduping each
// voter's latest stamp and deriving weights), runs the scoring core, and rolls
// up the count and last-confirmed timestamp.

import {
  computeRankingScore,
  computeScore,
  inheritedPriorMean,
  type ScoringStamp,
  type StampOutcome,
} from "./score";
import {
  computeCompetenceWeight,
  computePersonWeight,
  DEFAULT_BASE_WEIGHT,
  type StampSource,
} from "./weights";

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
  networkBucket: string | null;
  createdAt: Date;
  voterCreatedAt: Date | null;
  /** On a retraction ("take back") row, the id of the stamp it cancels; null on
   *  a normal stamp. */
  retractsStampId: string | null;
}

// Correlation assumed between anonymous stamps from the same network bucket.
// High: an anonymous burst from one /24 is one opinion echoing, so the second
// and later stamps add little. Signed-in stamps are deduped per voter instead
// and never bucket-clustered.
const ANON_SAME_NETWORK_RHO = 0.8;

export interface StampSummary {
  /** 0-1000 reliability score, or null when below the display gate. */
  score: number | null;
  /**
   * 0-1000 ungated ranking estimate that search ranks on. Always present (even
   * with no stamps it equals the inherited prior), so a fresh version keeps the
   * lineage's standing instead of dropping to zero. See verification 4.8.
   */
  rankingScore: number;
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

/** One row of a voter's history: their verdict on a version, next to where
 *  that version's displayed score settled. */
export interface VoterHistoryRow {
  outcome: StampOutcome;
  versionScore: number;
}

// Consensus bands for the track record. Versions scoring between the bands are
// contested; nobody's competence should move on them.
const CONSENSUS_POSITIVE_MIN = 600;
const CONSENSUS_NEGATIVE_MAX = 400;

/**
 * Track-record competence weight from a voter's historical stamps, compared to
 * the consensus each stamped version settled on. Stateless by design: no
 * stored counters to drift; as consensus shifts, the next recompute re-judges.
 * "worked with caveats" counts as a positive verdict (the guide worked).
 */
export function competenceWeightFromHistory(history: VoterHistoryRow[]): number {
  let agreed = 0;
  let disagreed = 0;
  for (const row of history) {
    const consensusPositive = row.versionScore >= CONSENSUS_POSITIVE_MIN;
    const consensusNegative = row.versionScore <= CONSENSUS_NEGATIVE_MAX;
    if (!consensusPositive && !consensusNegative) continue;
    const votedPositive = row.outcome !== "didnt_work";
    if (votedPositive === consensusPositive) agreed += 1;
    else disagreed += 1;
  }
  return computeCompetenceWeight({ agreed, disagreed });
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

// A stamp's cluster: an explicitly-assigned detector cluster wins; otherwise
// anonymous stamps from the same network bucket share one, and everything else
// is its own singleton (no collapse).
function clusterIdFor(row: StampRow): string {
  if (row.clusterId !== null) return row.clusterId;
  if (row.voterUserId === null && row.networkBucket !== null) return `net:${row.networkBucket}`;
  return row.id;
}

function toScoringStamp(
  row: StampRow,
  now: Date,
  competenceByVoter: ReadonlyMap<string, number>,
): ScoringStamp {
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
    // Track-record weight, computed by the caller from the voter's historical
    // stamps vs the consensus those versions settled on (recompute.ts).
    // Neutral for anonymous stamps and voters without a record.
    competenceWeight: row.voterUserId === null ? 1 : (competenceByVoter.get(row.voterUserId) ?? 1),
    ageDays: daysBetween(row.createdAt, now),
    clusterId: clusterIdFor(row),
  };
}

// rho per cluster: anonymous same-network clusters get the fixed correlation;
// detector-assigned clusters can refine this later. Singletons need no entry
// (absent = independent).
function buildClusterRho(rows: StampRow[]): Map<string, number> {
  const rho = new Map<string, number>();
  for (const row of rows) {
    const id = clusterIdFor(row);
    if (id.startsWith("net:")) rho.set(id, ANON_SAME_NETWORK_RHO);
  }
  return rho;
}

/**
 * Rolls a version's raw stamp rows up into its cached aggregate.
 *
 * @param previousRankingScore  the previous version's stored ranking score (or
 *   null for a first version), which seeds this version's ranking-estimate prior
 *   so a fresh version inherits, rather than resets, the lineage's standing.
 */
export function summarizeStamps(
  rows: StampRow[],
  now: Date = new Date(),
  previousRankingScore: number | null = null,
  competenceByVoter: ReadonlyMap<string, number> = new Map(),
): StampSummary {
  // Apply take-backs. A retraction is an append-only row, never a delete, so
  // the ledger stays auditable. It drops out of scoring two ways at once:
  //  - signed-in: the retraction is the voter's LATEST action, so
  //    dedupeLatestPerVoter keeps only it, and removing retraction rows here
  //    zeroes that voter (an earlier vote can't resurrect, dedup already
  //    dropped it).
  //  - anonymous: no voter to dedupe on, so the retraction names the exact
  //    stamp it undoes; both that target and the retraction row are removed.
  const retractedTargets = new Set(
    rows.map((row) => row.retractsStampId).filter((id): id is string => id !== null),
  );
  const kept = dedupeLatestPerVoter(rows).filter(
    (row) => row.retractsStampId === null && !retractedTargets.has(row.id),
  );
  const scoringStamps = kept.map((row) => toScoringStamp(row, now, competenceByVoter));
  const clusterRho = buildClusterRho(kept);

  const result = computeScore(scoringStamps, clusterRho);
  const rankingScore = computeRankingScore(
    scoringStamps,
    inheritedPriorMean(previousRankingScore),
    clusterRho,
  );

  let lastConfirmedAt: Date | null = null;
  for (const row of kept) {
    if (row.outcome === "didnt_work") continue;
    if (lastConfirmedAt === null || row.createdAt > lastConfirmedAt) {
      lastConfirmedAt = row.createdAt;
    }
  }

  return {
    score: result.status === "verified" ? result.score : null,
    rankingScore,
    stampCount: kept.length,
    lastConfirmedAt,
    effectiveWeight: result.effectiveWeight,
  };
}
