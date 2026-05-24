// Verification scoring core. Pure math, no DB, no I/O. Turns a guide version's
// stamps into one comparable 0-1000 reliability score (bigger = better).
//
// Model: a value-weighted Bayesian shrinkage mean. Each stamp has an outcome
// value (worked = 1, caveats = 0.6, didn't-work
// = 0) and an effective weight (source tier x personhood x competence x freshness
// decay x diversity collapse). The mean shrinks toward a global prior so a
// 3-stamp guide cannot outrank a 300-stamp one, and correlated stamps collapse
// via effective sample size so a Sybil burst counts as ~1.
//
// This module is deliberately ignorant of where weights come from. Per-voter
// weights (person, competence) and the source-tier base weight are derived
// upstream (see weights.ts) and the cluster assignment + correlation come from
// the anti-abuse detector. Keeping those out makes the scoring math pure and
// testable in isolation.

/** A reproducibility outcome a verifier can stamp on a guide version. */
export type StampOutcome = "worked" | "worked_with_caveats" | "didnt_work";

/** Tunable scoring parameters. Defaults live in {@link DEFAULT_SCORING_CONFIG}. */
export interface ScoringConfig {
  /** Numeric value per outcome; the score is a weighted mean of these. */
  outcomeValue: Record<StampOutcome, number>;
  /** Freshness decay half-life in days. A stamp this old counts half as much. */
  halfLifeDays: number;
  /** Prior strength (kappa): effective stamps of gravity toward the prior mean. */
  priorStrength: number;
  /** Prior mean (m): the platform-wide value the score shrinks toward. */
  priorMean: number;
  /** Below this total effective weight, the guide reads "not verified yet". */
  minEffectiveWeight: number;
  /** Output scale; 1000 maps the [0,1] mean to a 0-1000 integer. */
  scoreScale: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  outcomeValue: { worked: 1.0, worked_with_caveats: 0.6, didnt_work: 0.0 },
  halfLifeDays: 182,
  priorStrength: 8,
  priorMean: 0.7,
  minEffectiveWeight: 3,
  scoreScale: 1000,
};

/**
 * One stamp as the scorer consumes it. The three weight factors and the age are
 * computed upstream; `clusterId` groups correlated stamps (a Sybil burst shares
 * one id), while independent stamps each get their own unique id.
 */
export interface ScoringStamp {
  outcome: StampOutcome;
  /** Source tier base weight (anon 0.05, signed-in human 1.0, agent 0.25/0.6). */
  baseWeight: number;
  /** Personhood/tenure weight in [0.2, 1.0]; 1.0 for sources where it doesn't apply. */
  personWeight: number;
  /** Track-record competence weight in [0.3, 2.0]; 1.0 when no record yet. */
  competenceWeight: number;
  /** Age of the stamp in days at scoring time, for freshness decay. */
  ageDays: number;
  /** Correlated-source cluster id; unique per stamp when independent. */
  clusterId: string;
}

export type ScoreResult =
  | { status: "verified"; score: number; effectiveWeight: number }
  | { status: "unverified"; effectiveWeight: number };

/** Exponential freshness decay: a stamp's weight halves every `halfLifeDays`. */
export function decayWeight(ageDays: number, halfLifeDays: number): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Per-stamp diversity discount for a correlated cluster, from the survey-sampling
 * effective sample size `n_eff = n / (1 + (n-1) * rho)`. Returns `n_eff / n`, the
 * fraction each stamp in the cluster still counts. `rho = 0` (independent) gives
 * 1; `rho -> 1` (a pure lockstep burst) makes a whole cluster count as ~one stamp.
 */
export function clusterDiscount(clusterSize: number, rho: number): number {
  if (clusterSize <= 1) return 1;
  const nEff = clusterSize / (1 + (clusterSize - 1) * rho);
  return nEff / clusterSize;
}

/**
 * Compute a guide version's reliability score from its stamps.
 *
 * @param stamps      every stamp on the version (already weight-resolved).
 * @param clusterRho  intra-cluster correlation per clusterId; absent = 0 (independent).
 * @param config      scoring parameters; defaults to {@link DEFAULT_SCORING_CONFIG}.
 */
export function computeScore(
  stamps: ScoringStamp[],
  clusterRho = new Map<string, number>(),
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreResult {
  const clusterSizes = new Map<string, number>();
  for (const stamp of stamps) {
    clusterSizes.set(stamp.clusterId, (clusterSizes.get(stamp.clusterId) ?? 0) + 1);
  }

  let totalWeight = 0; // W: total effective evidence
  let valueSum = 0; // S: weighted value sum
  for (const stamp of stamps) {
    const size = clusterSizes.get(stamp.clusterId) ?? 1;
    const rho = clusterRho.get(stamp.clusterId) ?? 0;
    const weight =
      stamp.baseWeight *
      stamp.personWeight *
      stamp.competenceWeight *
      decayWeight(stamp.ageDays, config.halfLifeDays) *
      clusterDiscount(size, rho);
    totalWeight += weight;
    valueSum += weight * config.outcomeValue[stamp.outcome];
  }

  if (totalWeight < config.minEffectiveWeight) {
    return { status: "unverified", effectiveWeight: totalWeight };
  }

  const mean =
    (valueSum + config.priorStrength * config.priorMean) / (totalWeight + config.priorStrength);
  return {
    status: "verified",
    score: Math.round(mean * config.scoreScale),
    effectiveWeight: totalWeight,
  };
}
