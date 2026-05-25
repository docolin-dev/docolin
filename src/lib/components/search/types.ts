// Client-facing shapes for the /search page, mirroring the /api/search JSON.
// Kept separate from $lib/search/retrieve (server-only; imports the DB) so these
// can be imported into components without dragging server code into the bundle.

export type SearchSort = "relevance" | "verified" | "recent" | "newest";

export interface Alternate {
  href: string;
  label: string;
  pangoScore: number | null;
  appliesTo: string[];
}

export interface SearchResult {
  title: string;
  description: string | null;
  snippet: string | null;
  href: string;
  kindPath: string;
  type: string;
  status: string;
  language: string;
  appliesTo: string[];
  pangoScore: number | null;
  lastConfirmedAt: string | null;
  servedIsLatest: boolean;
  alternates: Alternate[];
}

export interface FacetCount {
  value: string;
  count: number;
}

/** A facet option as shown in the rail: raw value, display label, and count. */
export interface FacetItem {
  value: string;
  label: string;
  count: number;
}

export interface KindFacetCount {
  /** Dotted ltree path, e.g. `hardware.gpu.nvidia`. */
  path: string;
  count: number;
}

export interface SearchFacets {
  type: FacetCount[];
  status: FacetCount[];
  language: FacetCount[];
  appliesTo: FacetCount[];
  kind: KindFacetCount[];
  total: number;
}

export interface SearchResponse {
  query: string;
  mode: string;
  total: number;
  results: SearchResult[];
  facets: SearchFacets | null;
}
