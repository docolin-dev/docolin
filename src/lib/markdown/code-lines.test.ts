import { describe, expect, it } from "bun:test";
import { buildHash, parseHash } from "./code-lines.ts";

// The hash <-> selection conversion is the shareable-line contract: a link must
// reopen exactly the lines that were lit. The range collapse/expand is off-by-one
// prone, so it is pinned here.

describe("parseHash", () => {
  it("expands a single line", () => {
    expect([...parseHash("#__codeline-0-5")]).toEqual(["0-5"]);
  });

  it("expands an inclusive range", () => {
    expect([...parseHash("#__codeline-0-5-7")]).toEqual(["0-5", "0-6", "0-7"]);
  });

  it("normalizes a reversed range", () => {
    expect([...parseHash("#__codeline-0-7-5")]).toEqual(["0-5", "0-6", "0-7"]);
  });

  it("combines comma-separated tokens across blocks", () => {
    expect([...parseHash("#__codeline-0-1,__codeline-2-3-4")]).toEqual(["0-1", "2-3", "2-4"]);
  });

  it("ignores foreign or malformed hashes", () => {
    expect(parseHash("#section-heading").size).toBe(0);
    expect(parseHash("#__codeline-0-x").size).toBe(0);
    expect(parseHash("").size).toBe(0);
  });
});

describe("buildHash", () => {
  it("collapses consecutive lines into one range token", () => {
    expect(buildHash(new Set(["0-3", "0-4", "0-5"]))).toBe("__codeline-0-3-5");
  });

  it("keeps non-consecutive lines as separate tokens, sorted", () => {
    expect(buildHash(new Set(["0-5", "0-1", "0-3"]))).toBe(
      "__codeline-0-1,__codeline-0-3,__codeline-0-5",
    );
  });

  it("merges runs and singles together", () => {
    expect(buildHash(new Set(["0-1", "0-2", "0-4"]))).toBe("__codeline-0-1-2,__codeline-0-4");
  });

  it("orders tokens by block then line", () => {
    expect(buildHash(new Set(["2-1", "0-9", "0-10"]))).toBe("__codeline-0-9-10,__codeline-2-1");
  });

  it("round-trips through parseHash", () => {
    const original = "__codeline-0-2-4,__codeline-0-8,__codeline-3-1";
    expect(buildHash(parseHash(`#${original}`))).toBe(original);
  });
});
