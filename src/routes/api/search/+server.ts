import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  aggregateFacets,
  resolveVersionContext,
  searchGuides,
  type DocoVersionContext,
  type SearchCandidate,
  type SearchFacets,
  type SearchSort,
} from "$lib/search/retrieve";
import { LIMITS } from "$lib/limits";
import { embedText } from "$lib/search/embed";
import { toIsoString } from "$lib/search/serialize";
import { pathFromSourcePath } from "$lib/doco-urls";
import { fromLtree, toLtree } from "$lib/server/db/schema/types";

// Public hybrid search. Two modes share one retrieval core: `lexical` is the
// instant as-you-type path (no embedding, cheap), `hybrid` adds the dense vector
// for full results. The response is reader-independent (no per-user data), so it
// is edge-cacheable. No query logging (privacy-first), and the query embedding
// runs on Workers AI inside our own infra, so the raw query never leaves the
// boundary.

const MAX_LIMIT = 30;

interface AlternateDto {
  href: string;
  label: string;
  pangoScore: number | null;
  publishedAt: string | null;
  appliesTo: string[];
}

interface SearchResultDto {
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
  alternates: AlternateDto[];
}

function splitCsv(value: string | null): string[] | null {
  if (value === null) return null;
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : null;
}

function clampInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

// ts_headline wraps matched terms in <mark> but does NOT escape the surrounding
// document text, so escape everything, then restore only the <mark> tags. Pure
// string ops, no DOM, so it works at the edge (unlike DOMPurify).
function sanitizeSnippet(raw: string): string {
  const escaped = raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return escaped.replaceAll("&lt;mark&gt;", "<mark>").replaceAll("&lt;/mark&gt;", "</mark>");
}

// Address an older version by its short commit SHA when available (immutable and
// canonical; the viewer resolves a 4+ hex-char prefix), falling back to the
// version number (the viewer resolves an all-digit suffix).
const SHORT_SHA_LENGTH = 7;
function versionSuffix(commitSha: string | null, versionNumber: number): string {
  return commitSha !== null && commitSha.length > 0
    ? commitSha.slice(0, SHORT_SHA_LENGTH)
    : String(versionNumber);
}

function buildDto(
  candidate: SearchCandidate,
  context: DocoVersionContext | undefined,
): SearchResultDto {
  const served = context?.served;
  const servedIsLatest = served?.isLatest ?? true;
  const pathFromRoot = pathFromSourcePath(candidate.pathInSource ?? "", candidate.subpath);
  const baseHref = `/${candidate.orgSlug}/${candidate.projectSlug}/${pathFromRoot}`;
  const href =
    served !== undefined && !served.isLatest
      ? `${baseHref}@${versionSuffix(served.commitSha, served.versionNumber)}`
      : baseHref;

  const alternates: AlternateDto[] = (context?.alternates ?? []).map((alt) => ({
    href: `${baseHref}@${versionSuffix(alt.commitSha, alt.versionNumber)}`,
    label: alt.versionTag ?? versionSuffix(alt.commitSha, alt.versionNumber),
    pangoScore: alt.verificationScore,
    publishedAt: toIsoString(alt.publishedAt),
    appliesTo: alt.appliesTo,
  }));

  return {
    title: candidate.title,
    description: candidate.description,
    snippet: candidate.snippet === null ? null : sanitizeSnippet(candidate.snippet),
    href,
    kindPath: fromLtree(candidate.kind),
    type: candidate.type,
    status: candidate.status,
    language: candidate.language,
    appliesTo: candidate.appliesTo,
    pangoScore: served?.verificationScore ?? candidate.verificationScore,
    lastConfirmedAt: toIsoString(candidate.verificationLastConfirmedAt),
    servedIsLatest,
    alternates,
  };
}

// At most three setup tags travel to the server (the reader's local profile
// stays local). Capping and sorting keeps the cache key space small, since the
// only thing the setup boost changes is result order.
const MAX_SETUP_TAGS = 3;

function parseSort(value: string | null): SearchSort {
  return value === "verified" || value === "recent" || value === "newest" ? value : "relevance";
}

export const GET: RequestHandler = async ({ url, platform, setHeaders }) => {
  // Truncated silently, not rejected (see LIMITS.searchQuery): bounds the
  // Workers AI embedding cost and the lexical tsquery size. This endpoint also
  // backs the MCP search/lookup tools, so the cap covers those too.
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, LIMITS.searchQuery);
  const mode = url.searchParams.get("mode") === "lexical" ? "lexical" : "hybrid";
  const lang = url.searchParams.get("lang") ?? "en";
  // English is the one stemmed language; everything else parses language-neutral.
  // bge-m3 carries cross-language semantic recall on the vector side.
  const cfg = lang === "en" ? "english" : "simple";
  const limit = clampInt(url.searchParams.get("limit"), 20, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 10_000);
  const sort = parseSort(url.searchParams.get("sort"));
  // The faceted /search page asks for counts; the palette/hero never do.
  const wantFacets = url.searchParams.get("facets") === "1";

  const kindParam = url.searchParams.get("kind");
  const minPangoRaw = Number.parseInt(url.searchParams.get("min_pango") ?? "", 10);
  const filters = {
    kindPrefix: kindParam !== null && kindParam.length > 0 ? toLtree(kindParam) : null,
    appliesTo: splitCsv(url.searchParams.get("applies_to")),
    types: splitCsv(url.searchParams.get("type")),
    status: splitCsv(url.searchParams.get("status")),
    language: url.searchParams.get("doc_lang"),
    verifiedOnly: url.searchParams.get("verified") === "1",
    minPango: Number.isFinite(minPangoRaw) && minPangoRaw > 0 ? minPangoRaw : null,
  };

  // Inferred reader setup: a soft ranking boost only (distinct from the hard
  // applies_to facet). Sorted + capped so the cache key stays stable.
  const setupTags = splitCsv(url.searchParams.get("setup"));
  const readerAppliesTo =
    setupTags === null
      ? null
      : [...setupTags].sort((a, b) => a.localeCompare(b)).slice(0, MAX_SETUP_TAGS);

  // Reader-independent given the URL (setup only reorders), so edge-cacheable;
  // thin TTL since content changes slowly.
  setHeaders({ "cache-control": "public, max-age=0, s-maxage=60" });

  // Empty query is a no-op for the palette/hero (they only fetch once the reader
  // types). A browse still runs when the faceted page asks for counts, or when a
  // kind is scoped (the kind landing pages and their client setup re-rank).
  if (q.length === 0 && !wantFacets && filters.kindPrefix === null) {
    return json({
      query: q,
      mode,
      total: 0,
      results: [] satisfies SearchResultDto[],
      facets: null,
    });
  }

  let qvec: number[] | null = null;
  if (mode === "hybrid" && q.length > 0) {
    const ai = platform?.env.AI;
    if (ai !== undefined) {
      // Best-effort: if Workers AI is unavailable (e.g. local dev without
      // credentials), fall back to lexical-only rather than failing the search.
      try {
        qvec = await embedText(ai, q);
      } catch {
        qvec = null;
      }
    }
  }

  // Results and facet counts are independent reads; run them together.
  const [candidates, facets] = await Promise.all([
    searchGuides({ q, cfg, qvec, filters, readerAppliesTo, sort, limit, offset }),
    wantFacets ? aggregateFacets({ q, cfg, filters }) : Promise.resolve<SearchFacets | null>(null),
  ]);

  // Lexical/autocomplete skips version resolution (instant path); full results
  // resolve the served version and alternates.
  let context = new Map<string, DocoVersionContext>();
  if (mode === "hybrid" && candidates.length > 0) {
    context = await resolveVersionContext(
      candidates.map((candidate) => candidate.docoId),
      filters.appliesTo,
    );
  }

  const results = candidates.map((candidate) => buildDto(candidate, context.get(candidate.docoId)));
  return json({ query: q, mode, total: facets?.total ?? results.length, results, facets });
};
