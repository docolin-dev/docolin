import { DefaultLinesDiffComputer } from "vscode-diff";
import { diffWordsWithSpace, diffChars } from "diff";

// Adapter over vscode-diff (the diff algorithm extracted from VS Code) that shapes
// its line-level result into the row model the auto-diff viewer renders. vscode-diff
// owns the hard part, aligning lines even when they were edited (a modification, not
// a spurious remove+add) and detecting relocated blocks; this module walks its
// changes into one row per line and flags moved lines. Within-line refinement rides
// on jsdiff below. DOM-free so it unit-tests, and lazily imported with the viewer, so
// neither engine reaches the read-path bundle.

export type DiffRowType = "same" | "add" | "del";

export interface DiffRow {
  type: DiffRowType;
  /** True when vscode-diff attributes this line to a relocated block, so it renders
   *  in a distinct color rather than as a plain add/remove. */
  moved: boolean;
  /** The index of the move this line belongs to (both sides of one move share it), or
   *  null. Lets the viewer pair a moved-out block with where it moved to on hover. */
  moveId: number | null;
  /** 0-based line index in the before text, or null for an added line. */
  before: number | null;
  /** 0-based line index in the after text, or null for a removed line. */
  after: number | null;
  text: string;
}

// One reusable computer; computeDiff is a pure call, no per-instance state to reset.
const computer = new DefaultLinesDiffComputer();

/** Diffs two arrays of lines into one row per line (removals before additions in a
 *  change block, git's unified order), flagging lines vscode-diff detected as moved. */
export function diffToRows(before: readonly string[], after: readonly string[]): DiffRow[] {
  const result = computer.computeDiff([...before], [...after], {
    ignoreTrimWhitespace: false,
    computeMoves: true,
    maxComputationTimeMs: 0,
  });

  // Map each 1-based moved line to its move's index, so both sides of one move share
  // an id and the viewer can pair a moved-out block with where it moved to.
  const movedBefore = new Map<number, number>();
  const movedAfter = new Map<number, number>();
  result.moves.forEach((move, moveId) => {
    const map = move.lineRangeMapping;
    for (let ln = map.original.startLineNumber; ln < map.original.endLineNumberExclusive; ln++) {
      movedBefore.set(ln, moveId);
    }
    for (let ln = map.modified.startLineNumber; ln < map.modified.endLineNumberExclusive; ln++) {
      movedAfter.set(ln, moveId);
    }
  });

  const rows: DiffRow[] = [];
  let origLine = 1; // 1-based cursor into before
  let modLine = 1; // 1-based cursor into after
  // Emit the unchanged rows up to `until` (a 1-based original line number).
  const emitSame = (until: number): void => {
    while (origLine < until) {
      rows.push({
        type: "same",
        moved: false,
        moveId: null,
        before: origLine - 1,
        after: modLine - 1,
        text: before[origLine - 1],
      });
      origLine++;
      modLine++;
    }
  };
  for (const change of result.changes) {
    emitSame(change.original.startLineNumber);
    for (
      let ln = change.original.startLineNumber;
      ln < change.original.endLineNumberExclusive;
      ln++
    ) {
      rows.push({
        type: "del",
        moved: movedBefore.has(ln),
        moveId: movedBefore.get(ln) ?? null,
        before: ln - 1,
        after: null,
        text: before[ln - 1],
      });
      origLine++;
    }
    for (
      let ln = change.modified.startLineNumber;
      ln < change.modified.endLineNumberExclusive;
      ln++
    ) {
      rows.push({
        type: "add",
        moved: movedAfter.has(ln),
        moveId: movedAfter.get(ln) ?? null,
        before: null,
        after: ln - 1,
        text: after[ln - 1],
      });
      modLine++;
    }
  }
  emitSame(before.length + 1);
  return rows;
}

/** Positional diff for offset snippets (the author gave the two sides different
 *  `linenums` starts, saying "these are offset windows of the same file"): lines
 *  pair by absolute file line number instead of by content. Same number + same
 *  text = an unchanged row; same number + different text = an edit (del + add,
 *  git-ordered per changed region); a number only one side covers = a plain
 *  removal / addition. No move detection here, the position IS the alignment. */
export function diffToRowsAligned(
  before: readonly string[],
  after: readonly string[],
  beforeStart: number,
  afterStart: number,
): DiffRow[] {
  const lo = Math.min(beforeStart, afterStart);
  const hi = Math.max(beforeStart + before.length, afterStart + after.length) - 1;
  const rows: DiffRow[] = [];
  // Buffer a changed region so its removals all land before its additions.
  let dels: DiffRow[] = [];
  let adds: DiffRow[] = [];
  const flush = (): void => {
    rows.push(...dels, ...adds);
    dels = [];
    adds = [];
  };
  for (let n = lo; n <= hi; n++) {
    const b = n - beforeStart;
    const a = n - afterStart;
    const hasB = b >= 0 && b < before.length;
    const hasA = a >= 0 && a < after.length;
    if (hasB && hasA && before[b] === after[a]) {
      flush();
      rows.push({ type: "same", moved: false, moveId: null, before: b, after: a, text: before[b] });
      continue;
    }
    if (hasB) {
      dels.push({
        type: "del",
        moved: false,
        moveId: null,
        before: b,
        after: null,
        text: before[b],
      });
    }
    if (hasA) {
      adds.push({
        type: "add",
        moved: false,
        moveId: null,
        before: null,
        after: a,
        text: after[a],
      });
    }
  }
  flush();
  return rows;
}

// ----- Intra-line refinement -----

export type SegType = "same" | "add" | "del";

export interface Seg {
  type: SegType;
  text: string;
}

// ----- Change-block alignment -----

// vscode-diff hands back a change block as a set of removed lines and a set of added
// lines; this pairs them so an edited line lines up with its new version (word-
// highlighted) while a genuinely new line (an added comment) stays a clean add. It
// drives the split layout too: an edit sits on one row, a pure add sits opposite a
// blank.

const PAIR_THRESHOLD = 0.4; // min shared-character fraction to call two lines "an edit"

/** Fraction of characters two lines share (0..1), via a char diff. */
export function lineSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  let same = 0;
  for (const change of diffChars(a, b)) {
    if (!change.added && !change.removed) same += change.value.length;
  }
  return same / longest;
}

/** Greedily aligns a removed run to an added run by similarity (best pairs first,
 *  each line used once). Returns [removedIndex, addedIndex] pairs into the runs;
 *  lines with no pairing are pure removals / additions. */
export function alignChanges(dels: readonly string[], adds: readonly string[]): [number, number][] {
  const candidates: { d: number; a: number; score: number }[] = [];
  for (let d = 0; d < dels.length; d++) {
    for (let a = 0; a < adds.length; a++) {
      const score = lineSimilarity(dels[d], adds[a]);
      if (score >= PAIR_THRESHOLD) candidates.push({ d, a, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  const usedDel = new Set<number>();
  const usedAdd = new Set<number>();
  const pairs: [number, number][] = [];
  for (const { d, a } of candidates) {
    if (usedDel.has(d) || usedAdd.has(a)) continue;
    usedDel.add(d);
    usedAdd.add(a);
    pairs.push([d, a]);
  }
  return pairs;
}

// ----- Syntax tokens + change overlay -----

// The diff reuses the source code blocks' shiki output, so each line comes in as a
// list of tokens (text + the inline style carrying shiki's --shiki-light/dark color
// vars). To keep the intra-line change highlight AND the syntax colors, we split the
// tokens at the changed-character boundaries and flag the changed pieces; the viewer
// then paints a highlight background on those while every piece keeps its color.

/** A shiki syntax token: its text and the inline style with the color vars. */
export interface Token {
  text: string;
  style: string;
}

/** A rendered code line for the diff: its plain text (used by the diff algorithm)
 *  and its shiki tokens (used for the syntax colors). */
export interface LineTokens {
  text: string;
  tokens: Token[];
}

/** A render piece: syntax-colored text, flagged when it is an intra-line change. */
export interface RenderSeg {
  text: string;
  style: string;
  changed: boolean;
}

/** The [start, end) character ranges (UTF-16, 0-based) of a line's changed spans,
 *  from one side of a word diff. */
export function changedRanges(segs: readonly Seg[], changedType: SegType): [number, number][] {
  const ranges: [number, number][] = [];
  let offset = 0;
  for (const seg of segs) {
    if (seg.type === changedType) ranges.push([offset, offset + seg.text.length]);
    offset += seg.text.length;
  }
  return ranges;
}

/** Splits a line's syntax tokens at the changed-range boundaries, so each returned
 *  piece keeps its token color and is flagged if it falls inside a change. */
export function mergeHighlight(
  tokens: readonly Token[],
  ranges: readonly [number, number][],
): RenderSeg[] {
  const isChanged = (i: number): boolean => ranges.some(([start, end]) => i >= start && i < end);
  const out: RenderSeg[] = [];
  let pos = 0;
  for (const token of tokens) {
    const len = token.text.length;
    let i = 0;
    while (i < len) {
      const changed = isChanged(pos + i);
      let j = i + 1;
      while (j < len && isChanged(pos + j) === changed) j++;
      const piece = token.text.slice(i, j);
      const last = out.at(-1);
      // Merge with the previous piece when the color + changed flag both match, so
      // adjacent tokens of the same color collapse (smaller DOM).
      if (last?.style === token.style && last.changed === changed) {
        last.text += piece;
      } else {
        out.push({ text: piece, style: token.style, changed });
      }
      i = j;
    }
    pos += len;
  }
  return out;
}

export type Granularity = "word" | "char";

/** Refines a changed line pair into removed-side and added-side runs at word or char
 *  granularity, so the viewer can highlight exactly what changed within the line. */
export function refineLine(
  before: string,
  after: string,
  granularity: Granularity,
): { del: Seg[]; add: Seg[] } {
  const changes =
    granularity === "char" ? diffChars(before, after) : diffWordsWithSpace(before, after);
  const del: Seg[] = [];
  const add: Seg[] = [];
  for (const change of changes) {
    if (change.added) {
      add.push({ type: "add", text: change.value });
    } else if (change.removed) {
      del.push({ type: "del", text: change.value });
    } else {
      del.push({ type: "same", text: change.value });
      add.push({ type: "same", text: change.value });
    }
  }
  return { del, add };
}
