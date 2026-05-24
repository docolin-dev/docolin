// Per-voter weight derivation for verification stamps. Pure functions that turn
// account facts into the weight factors {@link ScoringStamp} consumes. Kept
// separate from score.ts so the scoring math stays ignorant of identity data.
//
// Two independent factors, combined multiplicatively, never conflated:
//   - person: "is this a real, invested human?" from tenure + passkey, CAPPED so
//     a merely-old or cheaply-minted account can never dominate.
//   - competence: "is this voter good at verifying?" earned from a track record
//     of stamps that matched eventual ground truth. The main driver; far harder
//     to farm than activity.

/** Where a stamp came from. Drives its base weight before person/competence. */
export type StampSource = "anonymous" | "human" | "agent_read" | "agent_executed";

/**
 * Source-tier base weights. Anonymous counts but cannot move the signal; an
 * agent that executed the steps and observed the outcome (falsifiable evidence)
 * outweighs one that only read the guide, and can approach a signed-in human.
 */
export const DEFAULT_BASE_WEIGHT: Record<StampSource, number> = {
  anonymous: 0.05,
  human: 1.0,
  agent_read: 0.25,
  agent_executed: 0.6,
};

const PERSON_MIN = 0.2;
const PERSON_MAX = 1.0;
const PERSON_TENURE_SPAN = 0.5; // tenure contributes up to this above PERSON_MIN
const PERSON_TENURE_SCALE_DAYS = 365; // tenure saturates over ~a year
const PERSON_PASSKEY_BONUS = 0.3;

export interface PersonWeightInput {
  /** Account age in days. */
  accountAgeDays: number;
  /** Whether the account has enrolled a passkey (a harder-to-Sybil signal). */
  hasPasskey: boolean;
}

/**
 * Personhood/tenure weight in [0.2, 1.0]. Saturating in tenure (so age stops
 * mattering past ~a year) plus a passkey bonus, hard-capped. Only for signed-in
 * sources; anonymous stamps use personWeight 1.0 and rely on their tiny base.
 */
export function computePersonWeight(input: PersonWeightInput): number {
  const tenure =
    PERSON_TENURE_SPAN *
    (1 - Math.exp(-Math.max(0, input.accountAgeDays) / PERSON_TENURE_SCALE_DAYS));
  const passkey = input.hasPasskey ? PERSON_PASSKEY_BONUS : 0;
  const raw = PERSON_MIN + tenure + passkey;
  return Math.min(PERSON_MAX, Math.max(PERSON_MIN, raw));
}

const COMPETENCE_MIN = 0.3;
const COMPETENCE_MAX = 2.0;
// Beta(2, 2) prior: a new voter sits at mean 0.5, neutral (competence 1.0).
const COMPETENCE_PRIOR_ALPHA = 2;
const COMPETENCE_PRIOR_BETA = 2;

export interface CompetenceWeightInput {
  /** Count of this voter's past stamps that matched eventual ground truth. */
  agreed: number;
  /** Count that disagreed with eventual ground truth. */
  disagreed: number;
}

/**
 * Track-record competence weight in [0.3, 2.0]. The Beta posterior mean of
 * (agreed vs disagreed) normalized against the prior mean, so a new voter scores
 * 1.0 (neutral), a consistently-correct voter rises toward 2.0, and a
 * consistently-wrong one falls toward 0.3. A great record is worth a few normal
 * voters, never hundreds.
 */
export function computeCompetenceWeight(input: CompetenceWeightInput): number {
  const agreed = Math.max(0, input.agreed);
  const disagreed = Math.max(0, input.disagreed);
  const posteriorMean =
    (COMPETENCE_PRIOR_ALPHA + agreed) /
    (COMPETENCE_PRIOR_ALPHA + COMPETENCE_PRIOR_BETA + agreed + disagreed);
  const priorMean = COMPETENCE_PRIOR_ALPHA / (COMPETENCE_PRIOR_ALPHA + COMPETENCE_PRIOR_BETA);
  const normalized = posteriorMean / priorMean;
  return Math.min(COMPETENCE_MAX, Math.max(COMPETENCE_MIN, normalized));
}
