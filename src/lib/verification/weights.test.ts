import { describe, it, expect } from "bun:test";
import { computePersonWeight, computeCompetenceWeight, DEFAULT_BASE_WEIGHT } from "./weights";

describe("computePersonWeight", () => {
  it("floors a brand-new account at 0.2", () => {
    expect(computePersonWeight({ accountAgeDays: 0, hasPasskey: false })).toBe(0.2);
  });

  it("rises with tenure but stays within [0.2, 1.0]", () => {
    const newish = computePersonWeight({ accountAgeDays: 30, hasPasskey: false });
    const oneYear = computePersonWeight({ accountAgeDays: 365, hasPasskey: false });
    const ancient = computePersonWeight({ accountAgeDays: 100000, hasPasskey: false });
    expect(oneYear).toBeGreaterThan(newish);
    expect(ancient).toBeGreaterThan(oneYear);
    // Tenure alone saturates below the cap, so age can never dominate on its own.
    expect(ancient).toBeCloseTo(0.7, 5);
  });

  it("rewards a passkey and caps at 1.0", () => {
    const withPasskey = computePersonWeight({ accountAgeDays: 365, hasPasskey: true });
    const without = computePersonWeight({ accountAgeDays: 365, hasPasskey: false });
    expect(withPasskey).toBeGreaterThan(without);
    expect(computePersonWeight({ accountAgeDays: 100000, hasPasskey: true })).toBe(1.0);
  });
});

describe("computeCompetenceWeight", () => {
  it("is neutral (1.0) for a voter with no track record", () => {
    expect(computeCompetenceWeight({ agreed: 0, disagreed: 0 })).toBeCloseTo(1.0, 10);
  });

  it("rises with a good record and falls with a bad one, clamped to [0.3, 2.0]", () => {
    const good = computeCompetenceWeight({ agreed: 10, disagreed: 0 });
    const bad = computeCompetenceWeight({ agreed: 0, disagreed: 10 });
    expect(good).toBeGreaterThan(1.0);
    expect(good).toBeLessThanOrEqual(2.0);
    expect(bad).toBeLessThan(1.0);
    expect(bad).toBeGreaterThanOrEqual(0.3);
  });

  it("ceilings a great record near 2.0 and floors a terrible one at 0.3", () => {
    // A Beta posterior mean is always < 1, so competence approaches but never
    // exceeds 2.0; the upper clamp is a guard. The lower clamp is reached.
    const great = computeCompetenceWeight({ agreed: 100000, disagreed: 0 });
    expect(great).toBeGreaterThan(1.99);
    expect(great).toBeLessThanOrEqual(2.0);
    expect(computeCompetenceWeight({ agreed: 0, disagreed: 100000 })).toBe(0.3);
  });
});

describe("DEFAULT_BASE_WEIGHT", () => {
  it("orders sources anonymous < agent_read < agent_executed < human", () => {
    expect(DEFAULT_BASE_WEIGHT.anonymous).toBeLessThan(DEFAULT_BASE_WEIGHT.agent_read);
    expect(DEFAULT_BASE_WEIGHT.agent_read).toBeLessThan(DEFAULT_BASE_WEIGHT.agent_executed);
    expect(DEFAULT_BASE_WEIGHT.agent_executed).toBeLessThan(DEFAULT_BASE_WEIGHT.human);
  });
});
