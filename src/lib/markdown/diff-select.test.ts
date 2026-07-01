import { describe, it, expect } from "bun:test";
import { parseDiffHash, buildDiffTokens, diffLineKey } from "./diff-select.ts";
import { replaceHashTokens } from "./hash-tokens.ts";

describe("parseDiffHash", () => {
  it("reads a single line and a range for the right diff", () => {
    const keys = parseDiffHash("#__diffline-0-b-1240,__diffline-0-a-5-7", 0);
    expect(keys).toEqual(new Set(["b-1240", "a-5", "a-6", "a-7"]));
  });

  it("ignores tokens of other diffs and foreign tokens", () => {
    const keys = parseDiffHash("#__diffline-1-b-3,__codeline-0-5", 0);
    expect(keys.size).toBe(0);
  });

  it("rejects malformed sides and non-positive lines", () => {
    expect(parseDiffHash("#__diffline-0-x-3", 0).size).toBe(0);
    expect(parseDiffHash("#__diffline-0-b-0", 0).size).toBe(0);
  });

  it("normalizes a reversed range", () => {
    expect(parseDiffHash("#__diffline-0-a-7-5", 0)).toEqual(new Set(["a-5", "a-6", "a-7"]));
  });
});

describe("buildDiffTokens", () => {
  it("collapses consecutive lines into a range and round-trips", () => {
    const keys = new Set([
      diffLineKey("a", 5),
      diffLineKey("a", 6),
      diffLineKey("a", 7),
      diffLineKey("b", 1240),
    ]);
    const tokens = buildDiffTokens(keys, 0);
    expect(tokens).toEqual(["__diffline-0-b-1240", "__diffline-0-a-5-7"]);
    expect(parseDiffHash(`#${tokens.join(",")}`, 0)).toEqual(keys);
  });

  it("keeps non-consecutive lines as separate tokens", () => {
    const tokens = buildDiffTokens(new Set([diffLineKey("b", 1), diffLineKey("b", 3)]), 2);
    expect(tokens).toEqual(["__diffline-2-b-1", "__diffline-2-b-3"]);
  });
});

describe("replaceHashTokens", () => {
  it("replaces only its own tokens, preserving foreign ones", () => {
    const merged = replaceHashTokens("#__codeline-0-5,__diffline-0-b-2", "__diffline-0-", [
      "__diffline-0-a-9",
    ]);
    expect(merged).toBe("__codeline-0-5,__diffline-0-a-9");
  });

  it("clears its own tokens when given none, keeping the rest", () => {
    expect(replaceHashTokens("#__diffline-0-b-2", "__diffline-0-", [])).toBe("");
    expect(replaceHashTokens("#__codeline-0-5,__diffline-0-b-2", "__diffline-0-", [])).toBe(
      "__codeline-0-5",
    );
  });

  it("does not touch another diff's tokens", () => {
    const merged = replaceHashTokens("#__diffline-1-b-2", "__diffline-0-", ["__diffline-0-b-9"]);
    expect(merged).toBe("__diffline-1-b-2,__diffline-0-b-9");
  });
});
