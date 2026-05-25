import type { SearchSort } from "./types";

// The /search page keeps all shareable filter state in the URL. These helpers
// parse the query string into a typed shape and serialize it back, emitting only
// non-default keys so links stay clean and edge-cacheable. (The reader's inferred
// setup is deliberately NOT in the URL: it is local and only ever a soft hint.)

export interface SearchFilters {
  q: string;
  /** Kind subtree, display form (e.g. `hardware/gpu`); null = all topics. */
  kind: string | null;
  appliesTo: string[];
  types: string[];
  status: string[];
  language: string | null;
  verifiedOnly: boolean;
  minPango: number | null;
  sort: SearchSort;
}

const SORTS: readonly SearchSort[] = ["relevance", "verified", "recent", "newest"];

function csv(value: string | null): string[] {
  if (value === null) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function nonEmpty(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function posInt(value: string | null): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseSort(value: string | null): SearchSort {
  return value !== null && (SORTS as readonly string[]).includes(value)
    ? (value as SearchSort)
    : "relevance";
}

export function parseFilters(params: URLSearchParams): SearchFilters {
  return {
    q: (params.get("q") ?? "").trim(),
    kind: nonEmpty(params.get("kind")),
    appliesTo: csv(params.get("applies_to")),
    types: csv(params.get("type")),
    status: csv(params.get("status")),
    language: nonEmpty(params.get("doc_lang")),
    verifiedOnly: params.get("verified") === "1",
    minPango: posInt(params.get("min_pango")),
    sort: parseSort(params.get("sort")),
  };
}

/** The page's own URL query: only non-default keys, so URLs stay clean. */
export function filtersToQuery(f: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.length > 0) p.set("q", f.q);
  if (f.kind !== null) p.set("kind", f.kind);
  if (f.appliesTo.length > 0) p.set("applies_to", f.appliesTo.join(","));
  if (f.types.length > 0) p.set("type", f.types.join(","));
  if (f.status.length > 0) p.set("status", f.status.join(","));
  if (f.language !== null) p.set("doc_lang", f.language);
  if (f.verifiedOnly) p.set("verified", "1");
  if (f.minPango !== null) p.set("min_pango", String(f.minPango));
  if (f.sort !== "relevance") p.set("sort", f.sort);
  return p;
}

/** Active hard filters (excludes q and sort): drives "Filters (n)" and reset. */
export function activeFilterCount(f: SearchFilters): number {
  return (
    (f.kind !== null ? 1 : 0) +
    f.appliesTo.length +
    f.types.length +
    f.status.length +
    (f.language !== null ? 1 : 0) +
    (f.verifiedOnly || f.minPango !== null ? 1 : 0)
  );
}

/** Toggles a value in a multi-select facet list. */
export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
