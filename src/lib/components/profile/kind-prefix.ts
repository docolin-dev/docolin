// How many leading kind segments a doco list can drop without losing meaning:
// the segments every doco in the list shares. On an org page all docos tend to
// live under the org's own subtree (tools/docolin/...), so repeating that
// prefix on every row is pure noise; only the distinguishing tail informs.
// Capped so at least one segment always survives for single-doco lists.
export function sharedKindPrefixLength(kinds: string[]): number {
  if (kinds.length === 0) return 0;
  const split = kinds.map((k) => k.split("/"));
  const shortest = Math.min(...split.map((s) => s.length));
  let shared = 0;
  while (shared < shortest && split.every((s) => s[shared] === split[0][shared])) {
    shared += 1;
  }
  return Math.min(shared, shortest - 1);
}
