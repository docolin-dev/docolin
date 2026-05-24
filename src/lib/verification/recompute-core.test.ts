import { describe, it, expect } from "bun:test";
import { summarizeStamps, daysBetween, type StampRow } from "./recompute-core";

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
    createdAt: NOW,
    voterCreatedAt: OLD_ACCOUNT,
    ...overrides,
  };
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
