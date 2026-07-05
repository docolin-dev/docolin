import { describe, it, expect } from "bun:test";
import {
  competenceWeightFromHistory,
  summarizeStamps,
  daysBetween,
  type StampRow,
  type VoterHistoryRow,
} from "./recompute-core";

const NOW = new Date("2026-05-24T00:00:00Z");
const OLD_ACCOUNT = new Date("2024-01-01T00:00:00Z"); // well over a year old

let seq = 0;
function row(overrides: Partial<StampRow> = {}): StampRow {
  seq += 1;
  return {
    id: `stamp-${seq.toString()}`,
    outcome: "worked",
    source: "human",
    voterUserId: `voter-${seq.toString()}`,
    clusterId: null,
    networkBucket: null,
    createdAt: NOW,
    voterCreatedAt: OLD_ACCOUNT,
    retractsStampId: null,
    ...overrides,
  };
}

// A take-back of `target`: a later append-only row that cancels it.
function retraction(target: StampRow, overrides: Partial<StampRow> = {}): StampRow {
  return row({
    voterUserId: target.voterUserId,
    source: target.source,
    networkBucket: target.networkBucket,
    createdAt: new Date(target.createdAt.getTime() + 1000),
    retractsStampId: target.id,
    ...overrides,
  });
}

describe("daysBetween", () => {
  it("measures whole days between two instants", () => {
    expect(daysBetween(new Date("2026-05-01T00:00:00Z"), new Date("2026-05-11T00:00:00Z"))).toBe(
      10,
    );
  });
});

describe("summarizeStamps dedupe", () => {
  it("counts a voter's repeated stamps on the same version only once", () => {
    const voterUserId = "voter-repeat";
    const rows = [
      row({ voterUserId, createdAt: new Date("2026-01-01T00:00:00Z") }),
      row({ voterUserId, createdAt: new Date("2026-03-01T00:00:00Z") }),
      row({ voterUserId, createdAt: new Date("2026-05-01T00:00:00Z") }),
    ];
    expect(summarizeStamps(rows, NOW).stampCount).toBe(1);
  });

  it("keeps the voter's latest outcome, so a later failure supersedes an earlier success", () => {
    const voterUserId = "voter-flip";
    const rows = [
      row({ voterUserId, outcome: "worked", createdAt: new Date("2026-01-01T00:00:00Z") }),
      row({ voterUserId, outcome: "didnt_work", createdAt: new Date("2026-05-01T00:00:00Z") }),
    ];
    const summary = summarizeStamps(rows, NOW);
    // Only the latest (a failure) survives, so there is no confirmation on record.
    expect(summary.stampCount).toBe(1);
    expect(summary.lastConfirmedAt).toBeNull();
  });

  it("keeps every anonymous stamp (no identity to dedupe on)", () => {
    const rows = [
      row({ source: "anonymous", voterUserId: null, voterCreatedAt: null }),
      row({ source: "anonymous", voterUserId: null, voterCreatedAt: null }),
      row({ source: "anonymous", voterUserId: null, voterCreatedAt: null }),
    ];
    const summary = summarizeStamps(rows, NOW);
    expect(summary.stampCount).toBe(3);
    // Three anonymous stamps weigh 0.15 total, far below the gate, so no score.
    expect(summary.score).toBeNull();
  });
});

describe("summarizeStamps lastConfirmedAt", () => {
  it("is the latest non-failure across voters and ignores failures", () => {
    const worked = new Date("2026-04-01T00:00:00Z");
    const failedLater = new Date("2026-05-01T00:00:00Z");
    const rows = [
      row({ voterUserId: "a", outcome: "worked", createdAt: worked }),
      row({ voterUserId: "b", outcome: "didnt_work", createdAt: failedLater }),
    ];
    expect(summarizeStamps(rows, NOW).lastConfirmedAt).toEqual(worked);
  });
});

describe("summarizeStamps gating", () => {
  it("stays unverified for a few human stamps but verifies once enough accrue", () => {
    const few = Array.from({ length: 3 }, () => row());
    const many = Array.from({ length: 8 }, () => row());
    expect(summarizeStamps(few, NOW).score).toBeNull();

    const manySummary = summarizeStamps(many, NOW);
    expect(manySummary.score).not.toBeNull();
    expect(manySummary.stampCount).toBe(8);
  });

  it("weighs an anonymous stamp far below a signed-in human stamp", () => {
    const anon = summarizeStamps(
      [row({ source: "anonymous", voterUserId: null, voterCreatedAt: null })],
      NOW,
    );
    const human = summarizeStamps([row()], NOW);
    expect(human.effectiveWeight).toBeGreaterThan(anon.effectiveWeight * 5);
  });
});

describe("summarizeStamps rankingScore", () => {
  it("is always present even when the gated display score is null", () => {
    const few = Array.from({ length: 3 }, () => row());
    const summary = summarizeStamps(few, NOW);
    expect(summary.score).toBeNull(); // below the display gate
    expect(summary.rankingScore).toBeGreaterThan(0); // still rankable by search
  });

  it("inherits the previous version's regressed estimate when there are no stamps", () => {
    // No stamps: the estimate equals the inherited prior. A 900 lineage regresses
    // to 0.84 -> 840; a first version (null predecessor) sits at the global 700.
    expect(summarizeStamps([], NOW, 900).rankingScore).toBe(840);
    expect(summarizeStamps([], NOW, null).rankingScore).toBe(700);
  });

  it("ranks a fresh stampless cut of a strong guide above a brand-new guide", () => {
    expect(summarizeStamps([], NOW, 900).rankingScore).toBeGreaterThan(
      summarizeStamps([], NOW, null).rankingScore,
    );
  });
});

describe("anonymous same-network clustering", () => {
  it("collapses an anonymous burst from one network bucket", () => {
    const burstSameNetwork = Array.from({ length: 10 }, () =>
      row({ voterUserId: null, voterCreatedAt: null, source: "anonymous", networkBucket: "aa" }),
    );
    const burstSpread = Array.from({ length: 10 }, (_, i) =>
      row({
        voterUserId: null,
        voterCreatedAt: null,
        source: "anonymous",
        networkBucket: `bucket-${i.toString()}`,
      }),
    );
    const same = summarizeStamps(burstSameNetwork, NOW);
    const spread = summarizeStamps(burstSpread, NOW);
    // Same-network stamps are mostly one echoed opinion; their evidence must
    // accumulate far slower than genuinely independent ones.
    expect(same.effectiveWeight).toBeLessThan(spread.effectiveWeight * 0.5);
  });

  it("leaves anonymous stamps without a bucket independent", () => {
    const unbucketed = Array.from({ length: 5 }, () =>
      row({ voterUserId: null, voterCreatedAt: null, source: "anonymous", networkBucket: null }),
    );
    const spread = Array.from({ length: 5 }, (_, i) =>
      row({
        voterUserId: null,
        voterCreatedAt: null,
        source: "anonymous",
        networkBucket: `b-${i.toString()}`,
      }),
    );
    expect(summarizeStamps(unbucketed, NOW).effectiveWeight).toBeCloseTo(
      summarizeStamps(spread, NOW).effectiveWeight,
      6,
    );
  });

  it("never bucket-clusters signed-in voters", () => {
    const signedInSameNetwork = [
      row({ networkBucket: "shared" }),
      row({ networkBucket: "shared" }),
    ];
    const signedInSpread = [row({ networkBucket: "x" }), row({ networkBucket: "y" })];
    expect(summarizeStamps(signedInSameNetwork, NOW).effectiveWeight).toBeCloseTo(
      summarizeStamps(signedInSpread, NOW).effectiveWeight,
      6,
    );
  });
});

describe("competenceWeightFromHistory", () => {
  const agree = (n: number): VoterHistoryRow[] =>
    Array.from({ length: n }, () => ({ outcome: "worked" as const, versionScore: 900 }));
  const disagree = (n: number): VoterHistoryRow[] =>
    Array.from({ length: n }, () => ({ outcome: "worked" as const, versionScore: 100 }));

  it("is neutral with no history", () => {
    expect(competenceWeightFromHistory([])).toBe(1);
  });

  it("rises with a consistently-correct record and falls with a wrong one", () => {
    const good = competenceWeightFromHistory(agree(20));
    const bad = competenceWeightFromHistory(disagree(20));
    expect(good).toBeGreaterThan(1);
    expect(bad).toBeLessThan(1);
  });

  it("ignores contested versions between the consensus bands", () => {
    const contested: VoterHistoryRow[] = [
      { outcome: "worked", versionScore: 500 },
      { outcome: "didnt_work", versionScore: 450 },
    ];
    expect(competenceWeightFromHistory(contested)).toBe(1);
  });

  it("counts worked-with-caveats as a positive verdict", () => {
    const caveats: VoterHistoryRow[] = [{ outcome: "worked_with_caveats", versionScore: 900 }];
    expect(competenceWeightFromHistory(caveats)).toBeGreaterThan(1);
  });
});

describe("competence in summarizeStamps", () => {
  it("weights a proven voter's stamp above an unknown voter's", () => {
    const proven = summarizeStamps(
      [row({ voterUserId: "expert" })],
      NOW,
      null,
      new Map([["expert", 2]]),
    );
    const unknown = summarizeStamps([row({ voterUserId: "newcomer" })], NOW, null, new Map());
    expect(proven.effectiveWeight).toBeGreaterThan(unknown.effectiveWeight);
  });
});

describe("summarizeStamps take-back (retractions)", () => {
  it("zeroes a signed-in voter who retracts their only stamp", () => {
    const worked = row({ voterUserId: "v1", outcome: "worked" });
    const summary = summarizeStamps([worked, retraction(worked)], NOW);
    expect(summary.stampCount).toBe(0);
    expect(summary.lastConfirmedAt).toBeNull();
  });

  it("does not resurrect an earlier vote when a later one is retracted", () => {
    // worked -> didn't work -> take back: the voter must count as nothing, not
    // fall back to the earlier "worked".
    const v = "v-resurrect";
    const worked = row({ voterUserId: v, outcome: "worked", createdAt: new Date("2026-01-01") });
    const didnt = row({ voterUserId: v, outcome: "didnt_work", createdAt: new Date("2026-02-01") });
    const summary = summarizeStamps([worked, didnt, retraction(didnt)], NOW);
    expect(summary.stampCount).toBe(0);
    expect(summary.lastConfirmedAt).toBeNull();
  });

  it("counts a fresh stamp placed after a take-back", () => {
    const v = "v-restamp";
    const a = row({ voterUserId: v, outcome: "worked", createdAt: new Date("2026-01-01") });
    const back = retraction(a, { createdAt: new Date("2026-02-01") });
    const c = row({ voterUserId: v, outcome: "worked", createdAt: new Date("2026-03-01") });
    expect(summarizeStamps([a, back, c], NOW).stampCount).toBe(1);
  });

  it("removes the exact anonymous stamp a retraction targets, keeping others", () => {
    const a = row({ voterUserId: null, source: "anonymous", outcome: "worked" });
    const b = row({ voterUserId: null, source: "anonymous", outcome: "worked" });
    const summary = summarizeStamps([a, b, retraction(a)], NOW);
    expect(summary.stampCount).toBe(1); // b survives, a and its retraction gone
  });

  it("never scores the retraction row itself", () => {
    const a = row({ voterUserId: null, source: "anonymous", outcome: "worked" });
    // Only a retraction present (its target already filtered): contributes nothing.
    expect(summarizeStamps([retraction(a)], NOW).stampCount).toBe(0);
  });
});
