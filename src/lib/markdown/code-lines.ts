// Client-only enhancement for shareable code lines. Each rendered code line has an
// id (`__codeline-{block}-{line}`). The header's select button toggles a block
// into selection mode; in that mode a click toggles a line and shift+click lights
// a contiguous range. The selection is mirrored into the URL hash so a shared link
// reopens with the same lines lit; a single line also works through pure CSS
// :target if this script never runs. Run once on mount; the returned function
// detaches the listeners.

const PREFIX = "__codeline-";

interface LineRef {
  block: number;
  line: number;
}

// Lines currently lit, keyed "block-line". Module-scoped so the click handler and
// the hash parser share one source of truth across all blocks on the page.
let selection = new Set<string>();
// The line a shift+click range extends from (the last single line picked).
let anchor: LineRef | null = null;

function parseId(id: string): LineRef | null {
  if (!id.startsWith(PREFIX)) return null;
  const parts = id.slice(PREFIX.length).split("-");
  if (parts.length !== 2) return null;
  const block = Number(parts[0]);
  const line = Number(parts[1]);
  if (!Number.isInteger(block) || !Number.isInteger(line)) return null;
  return { block, line };
}

// Hash tokens look like "{prefix}{block}-{line}" (one line) or "...-{from}-{to}" (a
// range), comma-separated. Expands to the full set of "block-line" keys.
export function parseHash(hash: string): Set<string> {
  const keys = new Set<string>();
  for (const raw of hash.replace("#", "").split(",")) {
    if (!raw.startsWith(PREFIX)) continue;
    const parts = raw
      .slice(PREFIX.length)
      .split("-")
      .map((value) => Number(value));
    if (parts.some((value) => !Number.isInteger(value))) continue;
    const block = parts[0];
    if (parts.length === 2) {
      keys.add(`${String(block)}-${String(parts[1])}`);
    } else if (parts.length === 3) {
      const lo = Math.min(parts[1], parts[2]);
      const hi = Math.max(parts[1], parts[2]);
      for (let line = lo; line <= hi; line++) keys.add(`${String(block)}-${String(line)}`);
    }
  }
  return keys;
}

// Collapses the selection back into a compact hash, merging consecutive lines of a
// block into one range token.
export function buildHash(keys: Set<string>): string {
  const byBlock = new Map<number, number[]>();
  for (const key of keys) {
    const dash = key.indexOf("-");
    const block = Number(key.slice(0, dash));
    const line = Number(key.slice(dash + 1));
    const lines = byBlock.get(block) ?? [];
    lines.push(line);
    byBlock.set(block, lines);
  }
  const tokens: string[] = [];
  for (const block of [...byBlock.keys()].sort((a, b) => a - b)) {
    const lines = (byBlock.get(block) ?? []).sort((a, b) => a - b);
    let start = 0;
    while (start < lines.length) {
      let end = start;
      while (end + 1 < lines.length && lines[end + 1] === lines[end] + 1) end += 1;
      tokens.push(
        start === end
          ? `${PREFIX}${String(block)}-${String(lines[start])}`
          : `${PREFIX}${String(block)}-${String(lines[start])}-${String(lines[end])}`,
      );
      start = end + 1;
    }
  }
  return tokens.join(",");
}

// Repaints: clears every lit line, then lights the current selection.
function apply(): void {
  for (const el of document.querySelectorAll(".line.line-selected")) {
    el.classList.remove("line-selected");
  }
  for (const key of selection) {
    document.getElementById(`${PREFIX}${key}`)?.classList.add("line-selected");
  }
}

function writeHash(): void {
  const hash = buildHash(selection);
  const url = hash === "" ? location.pathname + location.search : `#${hash}`;
  // Preserve whatever state SvelteKit's router stored; we only change the hash,
  // and via replaceState so fiddling with lines neither spams Back nor jumps.
  const state: unknown = history.state;
  history.replaceState(state, "", url);
}

function scrollToFirst(): void {
  const first = selection.values().next().value;
  if (first === undefined) return;
  document.getElementById(`${PREFIX}${first}`)?.scrollIntoView({ block: "center" });
}

// Enter/leave selection mode for one block. Highlights persist either way; the
// mode only governs whether lines respond to hover and clicks.
function toggleMode(button: Element): void {
  const block = button.closest(".code-block");
  if (!(block instanceof HTMLElement)) return;
  const on = block.hasAttribute("data-selecting");
  if (on) block.removeAttribute("data-selecting");
  else block.setAttribute("data-selecting", "");
  button.setAttribute("aria-pressed", on ? "false" : "true");
}

// Plain click replaces the selection with this one line; shift extends a range
// from the anchor (keeping the rest); ctrl/cmd toggles this line (keeping the
// rest). Mirrors the familiar list-selection model.
function selectLine(lineEl: Element, shift: boolean, toggle: boolean): void {
  const ref = parseId(lineEl.id);
  if (ref === null) return;
  const key = `${String(ref.block)}-${String(ref.line)}`;
  if (shift && anchor !== null && anchor.block === ref.block) {
    const lo = Math.min(anchor.line, ref.line);
    const hi = Math.max(anchor.line, ref.line);
    for (let line = lo; line <= hi; line++) selection.add(`${String(ref.block)}-${String(line)}`);
  } else if (toggle) {
    if (selection.has(key)) selection.delete(key);
    else selection.add(key);
    anchor = ref;
  } else {
    selection = new Set([key]);
    anchor = ref;
  }
  apply();
  writeHash();
}

function onClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const toggle = event.target.closest("[data-code-select]");
  if (toggle !== null) {
    toggleMode(toggle);
    return;
  }
  const lineEl = event.target.closest(".line");
  if (lineEl === null) return;
  const block = lineEl.closest(".code-block");
  // Lines respond to clicks only while their block is in selection mode.
  if (!(block instanceof HTMLElement) || !block.hasAttribute("data-selecting")) return;
  selectLine(lineEl, event.shiftKey, event.ctrlKey || event.metaKey);
}

function onHashChange(): void {
  selection = parseHash(location.hash);
  apply();
}

/** Wires shareable line selection. Reads any line hash already in the URL (a
 *  shared link), lights it and scrolls it into view, then handles clicks and
 *  later hash changes. */
export function setupCodeLineSelect(): () => void {
  selection = parseHash(location.hash);
  apply();
  scrollToFirst();
  document.addEventListener("click", onClick);
  window.addEventListener("hashchange", onHashChange);
  return () => {
    document.removeEventListener("click", onClick);
    window.removeEventListener("hashchange", onHashChange);
  };
}
