// Shareable diff lines (docomd `!!! diff`). A selected line is addressed by the
// diff's document order on the page, the side it lives on (b = before, a = after),
// and its absolute line number (linenums-aware), so a shared link survives the
// viewer's layout, swap, and word-highlight settings. Hash tokens look like
// `__diffline-{diff}-{side}-{line}` for one line and
// `__diffline-{diff}-{side}-{from}-{to}` for a range; they share the URL hash with
// the code-block `__codeline-` tokens (see hash-tokens.ts).

export const DIFF_LINE_PREFIX = "__diffline-";

// The widest range one hash token may expand to. The hash arrives via shared
// links, so a crafted `...-1-999999999` token must not expand line-by-line and
// freeze the tab of whoever opens the link.
const MAX_RANGE = 5_000;

export type DiffSide = "b" | "a";

/** Selection key for one line: "{side}-{line}" with the absolute line number. */
export function diffLineKey(side: DiffSide, line: number): string {
  return `${side}-${String(line)}`;
}

/** Expands the hash's tokens for one diff into its set of selection keys. */
export function parseDiffHash(hash: string, diff: number): Set<string> {
  const keys = new Set<string>();
  for (const raw of hash.replace("#", "").split(",")) {
    if (!raw.startsWith(DIFF_LINE_PREFIX)) continue;
    const parts = raw.slice(DIFF_LINE_PREFIX.length).split("-");
    if (parts.length !== 3 && parts.length !== 4) continue;
    if (Number(parts[0]) !== diff) continue;
    const side = parts[1];
    if (side !== "b" && side !== "a") continue;
    const from = Number(parts[2]);
    const to = parts.length === 4 ? Number(parts[3]) : from;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) continue;
    if (Math.abs(to - from) > MAX_RANGE) continue;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let line = lo; line <= hi; line++) keys.add(diffLineKey(side, line));
  }
  return keys;
}

/** Collapses one diff's selection keys back into compact hash tokens, merging
 *  consecutive lines of a side into one range token. */
export function buildDiffTokens(keys: ReadonlySet<string>, diff: number): string[] {
  const bySide: Record<DiffSide, number[]> = { b: [], a: [] };
  for (const key of keys) {
    const dash = key.indexOf("-");
    const side = key.slice(0, dash);
    if (side !== "b" && side !== "a") continue;
    const line = Number(key.slice(dash + 1));
    if (Number.isInteger(line)) bySide[side].push(line);
  }
  const tokens: string[] = [];
  for (const side of ["b", "a"] as const) {
    const lines = bySide[side].sort((x, y) => x - y);
    let start = 0;
    while (start < lines.length) {
      let end = start;
      while (end + 1 < lines.length && lines[end + 1] === lines[end] + 1) end += 1;
      const head = `${DIFF_LINE_PREFIX}${String(diff)}-${side}-${String(lines[start])}`;
      tokens.push(start === end ? head : `${head}-${String(lines[end])}`);
      start = end + 1;
    }
  }
  return tokens;
}
