import { describe, it, expect } from "bun:test";
import { foldSetup, inferFromWeights } from "./setup-profile";

describe("foldSetup", () => {
  it("adds 1 to a newly read tag", () => {
    expect(foldSetup({}, ["ubuntu"])).toEqual({ ubuntu: 1 });
  });

  it("decays existing tags and reinforces the read ones (w = w*0.9 + 1)", () => {
    const next = foldSetup({ ubuntu: 1, fedora: 1 }, ["ubuntu"]);
    expect(next.ubuntu).toBeCloseTo(1.9, 5); // 1*0.9 + 1
    expect(next.fedora).toBeCloseTo(0.9, 5); // 1*0.9, not read this time
  });

  it("prunes tags that decay below the floor", () => {
    // 0.16 -> 0.144 (< 0.15 floor) so it drops out entirely.
    const next = foldSetup({ stale: 0.16 }, ["wayland"]);
    expect(next.stale).toBeUndefined();
    expect(next.wayland).toBe(1);
  });

  it("caps the map to the heaviest 20 tags", () => {
    const current: Record<string, number> = {};
    for (let i = 0; i < 30; i++) current[`tag${String(i)}`] = i + 1;
    const next = foldSetup(current, ["fresh"]);
    expect(Object.keys(next).length).toBe(20);
    // The lightest survivors are dropped; the heaviest (tag29 -> 30*0.9) stays.
    expect(next.tag29).toBeCloseTo(27, 5);
    expect(next.tag0).toBeUndefined();
  });
});

describe("inferFromWeights", () => {
  it("returns tags above the floor, heaviest first", () => {
    expect(inferFromWeights({ ubuntu: 3, wayland: 1, fluke: 0.2 })).toEqual(["ubuntu", "wayland"]);
  });

  it("excludes a single stray visit (below the 0.5 floor after one decay)", () => {
    // A tag read once then decayed once sits at 0.9 (kept); decayed twice -> 0.81;
    // a 0.2-weight tag is below the floor and excluded.
    expect(inferFromWeights({ stray: 0.2 })).toEqual([]);
  });

  it("honors the topN cap", () => {
    const weights = { a: 5, b: 4, c: 3, d: 2 };
    expect(inferFromWeights(weights, 2)).toEqual(["a", "b"]);
  });
});
