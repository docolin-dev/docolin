// Local, dwell-weighted setup profile. Infers the reader's likely setup (the
// applies_to tags like `ubuntu`, `wayland`, `postgres`) from the docos they
// actually spend time reading, so search can softly boost matching guides and,
// later, resolve soft links to the right variant.
//
// Privacy-first: the profile lives only in localStorage. It is never synced to a
// server account and is not a fingerprint; only a tiny capped slice of inferred
// tags is ever sent (as a ranking hint) on a search request.

const STORAGE_KEY = "docolin:setup";
const TUNED_KEY = "docolin:setup-tuned";

// Each qualifying doco view decays every existing weight, then adds 1 to the
// tags just read (`w = w*0.9 + 1`), so the profile drifts as the reader's
// machine and interests change instead of accumulating forever.
const DECAY = 0.9;
// Tags whose weight has decayed below this are dropped (they stopped mattering).
const PRUNE_FLOOR = 0.15;
// Hard cap on stored tags; only the heaviest survive.
const MAX_TAGS = 20;
// A tag must reach this weight (roughly: read twice, or once recently) before it
// counts as part of the inferred setup, so a single stray visit does not stick.
const INFER_FLOOR = 0.5;
const DEFAULT_INFER_TOP_N = 6;

type WeightMap = Record<string, number>;

interface ProfileData {
  version: 1;
  tags: WeightMap;
}

// ── Pure cores (no storage; unit-tested) ────────────────────────────────────

/**
 * Folds a freshly-read doco's tags into the weight map: every existing weight
 * decays, the read tags gain 1, then sub-floor tags are pruned and the map is
 * capped to the heaviest MAX_TAGS.
 */
export function foldSetup(current: WeightMap, tags: string[]): WeightMap {
  const next: WeightMap = {};
  for (const [tag, weight] of Object.entries(current)) {
    next[tag] = weight * DECAY;
  }
  for (const tag of tags) {
    next[tag] = (next[tag] ?? 0) + 1;
  }
  const kept = Object.entries(next)
    .filter(([, weight]) => weight >= PRUNE_FLOOR)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TAGS);
  return Object.fromEntries(kept);
}

/** The inferred setup: the heaviest tags above the confidence floor. */
export function inferFromWeights(
  tags: WeightMap,
  topN: number = DEFAULT_INFER_TOP_N,
  floor: number = INFER_FLOOR,
): string[] {
  return Object.entries(tags)
    .filter(([, weight]) => weight >= floor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([tag]) => tag);
}

// ── Storage wrappers ────────────────────────────────────────────────────────

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function readWeights(): WeightMap {
  if (!hasStorage()) return {};
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return {};
  // A malformed or hand-edited value should never break search; treat it as
  // empty rather than throwing. JSON.parse is the only thing that can throw here.
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; tags?: unknown };
    if (parsed.version !== 1 || typeof parsed.tags !== "object" || parsed.tags === null) return {};
    return parsed.tags as WeightMap;
  } catch {
    return {};
  }
}

function writeWeights(tags: WeightMap): void {
  if (!hasStorage()) return;
  const data: ProfileData = { version: 1, tags };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Records a qualifying doco view (called after the dwell threshold is met). */
export function recordSetup(tags: string[]): void {
  if (tags.length === 0 || !hasStorage()) return;
  writeWeights(foldSetup(readWeights(), tags));
}

/** The reader's inferred setup tags, heaviest first. Empty for a fresh visitor. */
export function getInferredSetup(topN: number = DEFAULT_INFER_TOP_N): string[] {
  return inferFromWeights(readWeights(), topN);
}

/** Forgets the whole profile (the reader's reset control). */
export function clearSetup(): void {
  if (!hasStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
}

// ── Tuned toggle (persisted; the reactive copy lives in the page) ────────────

/** Whether the reader wants results tuned to their inferred setup. Default on. */
export function getTuned(): boolean {
  if (!hasStorage()) return true;
  return localStorage.getItem(TUNED_KEY) !== "0";
}

export function setTuned(on: boolean): void {
  if (!hasStorage()) return;
  localStorage.setItem(TUNED_KEY, on ? "1" : "0");
}
