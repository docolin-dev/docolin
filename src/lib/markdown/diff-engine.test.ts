import { describe, it, expect } from "bun:test";
import {
  diffToRows,
  diffToRowsAligned,
  refineLine,
  lineSimilarity,
  alignChanges,
  changedRanges,
  mergeHighlight,
} from "./diff-engine.ts";

// vscode-diff owns the diff algorithm; these pin OUR adapter: the per-line row model,
// similarity alignment, and the intra-line refinement the viewer renders.

describe("diffToRows", () => {
  it("marks unchanged lines as same with both indices", () => {
    const rows = diffToRows(["a", "b"], ["a", "b"]);
    expect(rows.map((r) => r.type)).toEqual(["same", "same"]);
    expect(rows[1]).toMatchObject({ before: 1, after: 1, text: "b" });
  });

  it("detects an added line with its after-index and null before", () => {
    const rows = diffToRows(["a", "c"], ["a", "b", "c"]);
    expect(rows.map((r) => r.type)).toEqual(["same", "add", "same"]);
    expect(rows[1]).toMatchObject({ type: "add", before: null, after: 1, text: "b" });
  });

  it("detects a removed line with its before-index and null after", () => {
    const rows = diffToRows(["a", "b", "c"], ["a", "c"]);
    expect(rows[1]).toMatchObject({ type: "del", before: 1, after: null, text: "b" });
  });

  it("splits a multi-line change into one row per line", () => {
    const rows = diffToRows(["x"], ["p", "q", "r"]);
    expect(rows.map((r) => r.type)).toEqual(["del", "add", "add", "add"]);
    expect(rows.slice(1).map((r) => r.text)).toEqual(["p", "q", "r"]);
  });

  it("leaves a plain edit unmoved (vscode-diff move detection is conservative)", () => {
    expect(diffToRows(["old"], ["new"]).every((r) => !r.moved)).toBe(true);
  });
});

describe("diffToRowsAligned", () => {
  it("pairs lines by absolute number, so identical text at different numbers stays unmatched", () => {
    // Windows 1-3 and 3-5 of the same file: only absolute line 3 overlaps.
    const rows = diffToRowsAligned(["x", "y", "z"], ["z", "q", "r"], 1, 3);
    expect(rows.map((r) => r.type)).toEqual(["del", "del", "same", "add", "add"]);
    expect(rows[2]).toMatchObject({ before: 2, after: 0, text: "z" });
  });

  it("renders an edit at a shared number as del + add", () => {
    const rows = diffToRowsAligned(["old"], ["new"], 7, 7);
    expect(rows.map((r) => r.type)).toEqual(["del", "add"]);
    expect(rows[0]).toMatchObject({ before: 0, after: null, text: "old" });
    expect(rows[1]).toMatchObject({ before: null, after: 0, text: "new" });
  });

  it("groups a changed region git-style, removals before additions", () => {
    const rows = diffToRowsAligned(["a1", "a2"], ["b1", "b2"], 1, 1);
    expect(rows.map((r) => r.type)).toEqual(["del", "del", "add", "add"]);
  });

  it("keeps matching lines at the same number as unchanged rows", () => {
    const rows = diffToRowsAligned(["keep", "old"], ["keep", "new"], 10, 10);
    expect(rows[0]).toMatchObject({ type: "same", before: 0, after: 0 });
  });
});

describe("refineLine", () => {
  it("highlights only the changed token at word granularity", () => {
    const { del, add } = refineLine("const x = 1;", "const x = 2;", "word");
    expect(del.filter((s) => s.type === "del").map((s) => s.text)).toEqual(["1"]);
    expect(add.filter((s) => s.type === "add").map((s) => s.text)).toEqual(["2"]);
    expect(del[0]).toEqual({ type: "same", text: "const x = " });
  });

  it("can refine at char granularity", () => {
    const { add } = refineLine("cat", "cart", "char");
    // the inserted "r" is the only added char
    expect(
      add
        .filter((s) => s.type === "add")
        .map((s) => s.text)
        .join(""),
    ).toBe("r");
  });
});

describe("changedRanges", () => {
  it("finds the char ranges of the changed side", () => {
    const { del } = refineLine("const x = 5;", "const x = 3;", "char");
    expect(changedRanges(del, "del")).toEqual([[10, 11]]); // the "5" at index 10
  });
});

describe("mergeHighlight", () => {
  it("splits a token at change boundaries, keeping color and flagging the change", () => {
    const segs = mergeHighlight([{ text: "ab", style: "c" }], [[1, 2]]);
    expect(segs).toEqual([
      { text: "a", style: "c", changed: false },
      { text: "b", style: "c", changed: true },
    ]);
  });

  it("merges adjacent same-color unchanged tokens", () => {
    const tokens = [
      { text: "a", style: "s" },
      { text: "b", style: "s" },
    ];
    expect(mergeHighlight(tokens, [])).toEqual([{ text: "ab", style: "s", changed: false }]);
  });

  it("keeps different-color tokens separate", () => {
    const tokens = [
      { text: "a", style: "s1" },
      { text: "b", style: "s2" },
    ];
    expect(mergeHighlight(tokens, []).length).toBe(2);
  });
});

describe("lineSimilarity", () => {
  it("scores identical lines 1 and unrelated lines 0", () => {
    expect(lineSimilarity("abc", "abc")).toBe(1);
    expect(lineSimilarity("xxxxxxxx", "yyyyyyyy")).toBe(0);
  });

  it("scores a small edit high", () => {
    expect(lineSimilarity("return ants > 5000;", "return ants > 3000;")).toBeGreaterThan(0.8);
  });
});

describe("alignChanges", () => {
  it("pairs an edited line and leaves a genuinely new line unpaired", () => {
    // The real case: the comment is a clean add; only the return line is an edit.
    const dels = ["return { rolledUp: ants > 5000 };"];
    const adds = ["// curl up sooner", "return { rolledUp: ants > 3000 };"];
    expect(alignChanges(dels, adds)).toEqual([[0, 1]]);
  });

  it("matches the most similar pairs first, across reordering", () => {
    const dels = ["const alpha = 1;", "const beta = 2;"];
    const adds = ["const beta = 2;", "const alpha = 9;"];
    const pairs = alignChanges(dels, adds);
    expect(pairs).toContainEqual([1, 0]); // identical beta lines
    expect(pairs).toContainEqual([0, 1]); // alpha edited 1 -> 9
  });

  it("leaves wholly different lines unpaired", () => {
    expect(alignChanges(["xxxxxxxx"], ["yyyyyyyy"])).toEqual([]);
  });
});
