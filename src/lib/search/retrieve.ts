import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { versions } from "$lib/server/db/schema";
import { DEFAULT_SCORING_CONFIG } from "$lib/verification/score";
import { EXAMPLE_KIND_ROOT } from "$lib/sync/frontmatter-schema";

// The reusable retrieval core: one hybrid query (lexical FTS + dense vector,
// fused with RRF, then re-ranked by the business signals) plus a version-
// resolution pass. The human search endpoint calls these now; the MCP server
// will call the same functions unchanged, so no retrieval logic lives in the
// HTTP layer. SQL is hand-written here (not a DB function) so it stays in code.

// Versions whose ranking score the cron hasn't computed yet rank as if at the
// global prior, so a just-published guide is not buried at zero.
const RANKING_PRIOR_FALLBACK = Math.round(
  DEFAULT_SCORING_CONFIG.priorMean * DEFAULT_SCORING_CONFIG.scoreScale,
);

// Candidate pool each ranker contributes before fusion (RRF top-k).
const CANDIDATE_POOL = 100;
// HNSW search effort, pinned per query via SET LOCAL (see searchGuides).
const HNSW_EF_SEARCH = 100;
// Weighted RRF: lexical slightly above semantic, since for a docs corpus exact-
// token agreement is a stronger trust signal than semantic proximity.
const RRF_K = 60;
const RRF_LEXICAL_WEIGHT = 1.0;
const RRF_SEMANTIC_WEIGHT = 0.8;
// Default count of alternate versions surfaced per result (verification 4.4).
const DEFAULT_ALTERNATES = 3;

// Render a JS array as a Postgres array-literal string so drizzle binds it as a
// single typed param. drizzle's sql template otherwise EXPANDS an array into a
// placeholder list ($1, $2, ...), which turns `${arr}::text[]` into a row cast
// and breaks. Elements are double-quoted with backslash escaping (valid for
// text[] and uuid[]); no regex (CLAUDE.md 3.8).
function pgArray(values: string[]): string {
  const quoted = values.map((v) => `"${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`);
  return `{${quoted.join(",")}}`;
}

/** FTS config for the query, mirroring the document side: English is stemmed,
 * everything else is language-neutral `simple`. */
export type SearchFtsConfig = "english" | "simple";

/**
 * Result ordering. `relevance` blends the lexical/dense rank (when there is a
 * query) with the business signals; for a browse listing (no query) the rank
 * collapses to a constant base, so `relevance` then orders purely by those
 * signals (ranking estimate, status, recency, reader-setup fit). The others are
 * query-independent single-column orderings.
 */
export type SearchSort = "relevance" | "verified" | "recent" | "newest";

export interface SearchFilters {
  /** ltree prefix; matches the kind subtree (e.g. `hardware.gpu`). */
  kindPrefix?: string | null;
  /** Setup tags; a guide passes if ANY of its versions' applies_to overlaps. */
  appliesTo?: string[] | null;
  types?: string[] | null;
  status?: string[] | null;
  language?: string | null;
  /** Keep only guides with at least one verification stamp (a Pango score). */
  verifiedOnly?: boolean;
  /** Keep only guides whose Pango score meets this threshold (implies verified). */
  minPango?: number | null;
}

export interface SearchInput {
  /** Raw user query. Empty runs the browse path (all latest matching filters). */
  q: string;
  cfg: SearchFtsConfig;
  /** Query embedding for the hybrid path, or null for lexical-only (instant). */
  qvec: number[] | null;
  filters?: SearchFilters;
  /** Reader setup for the soft ranking boost (distinct from the hard facet). */
  readerAppliesTo?: string[] | null;
  /** Result ordering. Defaults to `relevance`. */
  sort?: SearchSort;
  limit?: number;
  offset?: number;
}

// Maps a sort mode to its ORDER BY clause. Values are a fixed whitelist (never
// user text), so they are safe to inline with sql.raw. Each non-relevance sort
// adds published_at as a stable tiebreaker.
const SORT_CLAUSES: Record<SearchSort, string> = {
  relevance: `"finalScore" DESC, v.published_at DESC`,
  verified: `v.verification_ranking_score DESC NULLS LAST, v.published_at DESC`,
  recent: `v.verification_last_confirmed_at DESC NULLS LAST, v.published_at DESC`,
  newest: `v.published_at DESC`,
};

// Browse rows (empty query) have no RRF rank; this constant base lets the
// business-signal multipliers in finalScore (ranking, status, recency, and the
// reader-setup boost) still produce a meaningful order under `relevance`.
const BROWSE_RANK_BASE = 1.0;

/** One ranked guide, viewed through its latest version. */
export interface SearchCandidate {
  docoId: string;
  versionId: string;
  /** ltree text (dotted); the caller maps it to the display path. */
  kind: string;
  type: string;
  title: string;
  description: string | null;
  appliesTo: string[];
  language: string;
  status: string;
  verificationScore: number | null;
  verificationRankingScore: number | null;
  // Raw `sql` execute returns timestamps as driver strings, not Date objects
  // (the query builder would map them); normalize with toIsoString before use.
  verificationLastConfirmedAt: Date | string | null;
  publishedAt: Date | string;
  orgSlug: string;
  projectSlug: string;
  pathInSource: string | null;
  subpath: string | null;
  snippet: string | null;
  finalScore: number;
}

/**
 * Hybrid retrieval over the latest published version of each guide. Lexical FTS
 * and dense vector each contribute a ranked candidate pool, fused with RRF, then
 * re-ranked by the Pango ranking estimate, status, recency, and reader-context
 * overlap. The facet predicates are pushed into each ranker (not a shared
 * materialized CTE) so the GIN and HNSW indexes are actually used. Pass a null
 * `qvec` for the cheap lexical-only path (autocomplete).
 */
export async function searchGuides(input: SearchInput): Promise<SearchCandidate[]> {
  const q = input.q.trim();
  const { cfg } = input;
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;
  const sort: SearchSort = input.sort ?? "relevance";
  const f = input.filters ?? {};
  const kindPrefix = f.kindPrefix ?? null;
  const types = f.types ?? null;
  const status = f.status ?? null;
  const language = f.language ?? null;
  const appliesTo = f.appliesTo ?? null;
  const verifiedOnly = f.verifiedOnly ?? false;
  const minPango = f.minPango ?? null;
  const readerAppliesTo = input.readerAppliesTo ?? null;
  // pgvector reads the text form '[0.1,0.2,...]'; null in lexical-only mode.
  const qvecLiteral = input.qvec === null ? null : `[${input.qvec.join(",")}]`;
  // Arrays go into the raw SQL as Postgres array-literal strings (see pgArray),
  // not as JS arrays, which drizzle would expand into placeholder lists.
  const typesParam = types === null ? null : pgArray(types);
  const statusParam = status === null ? null : pgArray(status);
  const appliesToParam = appliesTo === null ? null : pgArray(appliesTo);
  const readerParam = readerAppliesTo === null ? null : pgArray(readerAppliesTo);

  // Hard facets on the latest version, except applies_to which is cross-version:
  // a guide passes if ANY of its versions fits the reader's setup, so a guide
  // whose latest dropped your setup but whose older cut still supports it is not
  // lost (the served version is resolved later). Deprecated is hidden unless an
  // explicit status filter asks for it.
  const facets = sql`
    v.is_latest
    AND NOT (v.kind <@ ${EXAMPLE_KIND_ROOT}::ltree)
    AND (${statusParam}::text[] IS NOT NULL OR v.status <> 'deprecated')
    AND (${language}::text IS NULL OR v.language = ${language})
    AND (${kindPrefix}::ltree IS NULL OR v.kind <@ ${kindPrefix}::ltree)
    AND (${typesParam}::text[] IS NULL OR v.type = ANY(${typesParam}::text[]))
    AND (${statusParam}::text[] IS NULL OR v.status = ANY(${statusParam}::text[]))
    AND (${appliesToParam}::text[] IS NULL OR EXISTS (
      SELECT 1 FROM versions av
      WHERE av.doco_id = v.doco_id AND av.applies_to && ${appliesToParam}::text[]
    ))
    AND (NOT ${verifiedOnly}::boolean OR v.verification_score IS NOT NULL)
    AND (${minPango}::int IS NULL OR v.verification_score >= ${minPango}::int)
  `;

  const result = (await db.transaction(async (tx) => {
    // SET LOCAL scopes the HNSW effort to this transaction, so it applies on the
    // pooled connection without leaking to the next caller.
    await tx.execute(sql`SET LOCAL hnsw.ef_search = ${sql.raw(String(HNSW_EF_SEARCH))}`);
    return tx.execute(sql`
      WITH tsq AS (SELECT websearch_to_tsquery(${cfg}::regconfig, ${q}) AS query),
      lexical AS (
        SELECT v.id,
               row_number() OVER (
                 ORDER BY ts_rank_cd(v.search_tsv, (SELECT query FROM tsq)) DESC
               ) AS rnk
        FROM versions v
        WHERE ${facets} AND ${q} <> '' AND v.search_tsv @@ (SELECT query FROM tsq)
        ORDER BY ts_rank_cd(v.search_tsv, (SELECT query FROM tsq)) DESC
        LIMIT ${sql.raw(String(CANDIDATE_POOL))}
      ),
      semantic AS (
        SELECT v.id,
               row_number() OVER (ORDER BY v.embedding <=> ${qvecLiteral}::vector) AS rnk
        FROM versions v
        WHERE ${facets} AND ${qvecLiteral}::text IS NOT NULL AND v.embedding IS NOT NULL
        ORDER BY v.embedding <=> ${qvecLiteral}::vector
        LIMIT ${sql.raw(String(CANDIDATE_POOL))}
      ),
      fused AS (
        SELECT COALESCE(l.id, s.id) AS id,
               ${sql.raw(String(RRF_LEXICAL_WEIGHT))} * COALESCE(1.0 / (${sql.raw(String(RRF_K))} + l.rnk), 0)
             + ${sql.raw(String(RRF_SEMANTIC_WEIGHT))} * COALESCE(1.0 / (${sql.raw(String(RRF_K))} + s.rnk), 0) AS rrf
        FROM lexical l FULL OUTER JOIN semantic s ON l.id = s.id
      ),
      cand AS (
        -- Query path: the fused RRF set. Browse path (empty query): every latest
        -- version matching the facets, with rrf 0 so a business sort orders them.
        -- The guards make exactly one arm non-empty for a given request.
        SELECT id, rrf FROM fused
        UNION ALL
        SELECT v.id, ${sql.raw(String(BROWSE_RANK_BASE))}::double precision AS rrf
        FROM versions v
        WHERE ${facets} AND ${q} = ''
      )
      SELECT
        v.doco_id AS "docoId",
        v.id AS "versionId",
        v.kind::text AS "kind",
        v.type AS "type",
        v.title AS "title",
        v.description AS "description",
        v.applies_to AS "appliesTo",
        v.language AS "language",
        v.status AS "status",
        v.verification_score AS "verificationScore",
        v.verification_ranking_score AS "verificationRankingScore",
        v.verification_last_confirmed_at AS "verificationLastConfirmedAt",
        v.published_at AS "publishedAt",
        o.slug AS "orgSlug",
        p.slug AS "projectSlug",
        d.path_in_source AS "pathInSource",
        gs.subpath AS "subpath",
        ts_headline(${cfg}::regconfig, COALESCE(v.description, v.title), (SELECT query FROM tsq),
          'StartSel=<mark>, StopSel=</mark>, MaxFragments=1, MaxWords=26, MinWords=10') AS "snippet",
        (
          cand.rrf
          * (1 + 0.5 * (COALESCE(v.verification_ranking_score, ${sql.raw(String(RANKING_PRIOR_FALLBACK))}) / 1000.0))
          -- Status weight: deprecated guides are still findable (so the reader
          -- can follow superseded_by), but ranked under stable + needs-update so
          -- a current guide on the same topic wins. Same weight as draft.
          * CASE v.status
              WHEN 'stable' THEN 1.0 WHEN 'needs-update' THEN 0.85 WHEN 'draft' THEN 0.70 WHEN 'deprecated' THEN 0.70 ELSE 1.0 END
          * (1 + 0.15 * exp(
              -extract(epoch FROM now() - COALESCE(v.verification_last_confirmed_at, v.published_at)) / (180 * 86400)))
          * CASE WHEN ${readerParam}::text[] IS NOT NULL AND v.applies_to && ${readerParam}::text[]
                 THEN 1.20 ELSE 1.0 END
        )::double precision AS "finalScore"
      FROM cand
      JOIN versions v ON v.id = cand.id
      JOIN docos d ON d.id = v.doco_id
      JOIN projects p ON p.id = d.project_id
      JOIN orgs o ON o.id = p.owner_org_id
      LEFT JOIN git_sources gs ON gs.id = d.git_source_id
      WHERE d.deleted_at IS NULL
      ORDER BY ${sql.raw(SORT_CLAUSES[sort])}
      LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}
    `);
  })) as unknown as { rows: SearchCandidate[] };

  return result.rows;
}

/** A specific version of a guide, for the served result or an alternate. */
export interface VersionRef {
  versionId: string;
  versionNumber: number;
  commitSha: string | null;
  versionTag: string | null;
  appliesTo: string[];
  verificationScore: number | null;
  /** When this version was published; shown as the alternate's "updated" age. */
  publishedAt: Date | string;
  isLatest: boolean;
}

export interface DocoVersionContext {
  /** The version to link as the primary result (latest, unless a filter makes
   * an older cut the better fit). */
  served: VersionRef;
  /** Up to N other verified versions, highest Pango first (verification 4.4). */
  alternates: VersionRef[];
}

interface VersionContextRow {
  docoId: string;
  versionId: string;
  versionNumber: number;
  isLatest: boolean;
  appliesTo: string[];
  status: string;
  verificationScore: number | null;
  publishedAt: Date | string;
  commitSha: string | null;
  versionTag: string | null;
}

function toVersionRef(row: VersionContextRow): VersionRef {
  return {
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    commitSha: row.commitSha,
    versionTag: row.versionTag,
    appliesTo: row.appliesTo,
    verificationScore: row.verificationScore,
    publishedAt: row.publishedAt,
    isLatest: row.isLatest,
  };
}

function arraysOverlap(a: string[], b: string[]): boolean {
  const set = new Set(a);
  return b.some((value) => set.has(value));
}

/**
 * Resolves, per guide, which version to serve and which alternates to surface.
 * The served version is the latest, unless an applies_to filter is active and
 * the latest does not fit the reader: then the highest-Pango version that does
 * fit is served (so the reader gets the cut that works on their setup, see
 * verification 4.5 / search spec 4). Alternates are the other verified, non-
 * deprecated versions by Pango, capped. One query for the whole result page.
 */
export async function resolveVersionContext(
  docoIds: string[],
  wantAppliesTo: string[] | null = null,
  alternatesPerDoco: number = DEFAULT_ALTERNATES,
): Promise<Map<string, DocoVersionContext>> {
  const out = new Map<string, DocoVersionContext>();
  if (docoIds.length === 0) return out;

  // Always include the latest; include older versions only when verified and not
  // deprecated, so an unproven or killed old cut is never surfaced. Highest Pango
  // first within each guide. Query builder so docoIds binds as a real array.
  const rows = await db
    .select({
      docoId: versions.docoId,
      versionId: versions.id,
      versionNumber: versions.versionNumber,
      isLatest: versions.isLatest,
      appliesTo: versions.appliesTo,
      status: versions.status,
      verificationScore: versions.verificationScore,
      publishedAt: versions.publishedAt,
      commitSha: versions.commitSha,
      versionTag: versions.versionTag,
    })
    .from(versions)
    .where(
      and(
        inArray(versions.docoId, docoIds),
        or(
          eq(versions.isLatest, true),
          and(isNotNull(versions.verificationScore), ne(versions.status, "deprecated")),
        ),
      ),
    )
    .orderBy(
      versions.docoId,
      sql`${versions.verificationScore} DESC NULLS LAST`,
      desc(versions.versionNumber),
    );

  const byDoco = new Map<string, VersionContextRow[]>();
  for (const row of rows) {
    const list = byDoco.get(row.docoId) ?? [];
    list.push(row);
    byDoco.set(row.docoId, list);
  }

  for (const [docoId, rows] of byDoco) {
    const latest = rows.find((r) => r.isLatest);
    if (latest === undefined) continue; // a guide always has a latest

    // Served version: the latest, unless a filter is active and the latest does
    // not fit, in which case the best-Pango fitting version (rows are already
    // Pango-ordered, so the first match wins).
    let served = latest;
    if (wantAppliesTo !== null && !arraysOverlap(latest.appliesTo, wantAppliesTo)) {
      const fitting = rows.find(
        (r) => r.status !== "deprecated" && arraysOverlap(r.appliesTo, wantAppliesTo),
      );
      if (fitting !== undefined) served = fitting;
    }

    const alternates = rows
      .filter((r) => r.versionId !== served.versionId && r.verificationScore !== null)
      .slice(0, alternatesPerDoco)
      .map(toVersionRef);

    out.set(docoId, { served: toVersionRef(served), alternates });
  }

  return out;
}

/** A facet value and how many results carry it. */
export interface FacetCount {
  value: string;
  count: number;
}

/** A kind facet entry keyed by its full ltree path; the client rolls these up
 * into a tree, accumulating each node's count onto its ancestors. */
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
  /** Result count for the fully-filtered set (the page's "N results"). */
  total: number;
}

export interface FacetInput {
  q: string;
  cfg: SearchFtsConfig;
  filters?: SearchFilters;
  /** Cap on the applies_to tag list (highest count first). */
  appliesToLimit?: number;
}

interface FacetRow {
  facet: string;
  value: string;
  count: number;
}

const DEFAULT_APPLIES_TO_FACET_LIMIT = 40;

/**
 * Facet counts for the current search, with sideways drill-down: each facet's
 * counts apply every OTHER active filter but not its own, so selecting one value
 * still shows how many results its siblings would add (the multi-select norm).
 *
 * One round-trip. A `matched` base CTE (latest, non-deprecated, query-matched if
 * a query is present) is grouped per dimension, each omitting its own predicate,
 * and the arms are UNION ALL'd into `(facet, value, count)` rows. The applies_to
 * PREDICATE is cross-version (matching `searchGuides`, so an older version that
 * fits the reader's setup still passes), while the applies_to FACET counts the
 * latest versions' tags, which is what the cards show.
 */
export async function aggregateFacets(input: FacetInput): Promise<SearchFacets> {
  const q = input.q.trim();
  const { cfg } = input;
  const f = input.filters ?? {};
  const kindPrefix = f.kindPrefix ?? null;
  const types = f.types ?? null;
  const status = f.status ?? null;
  const language = f.language ?? null;
  const appliesTo = f.appliesTo ?? null;
  const verifiedOnly = f.verifiedOnly ?? false;
  const minPango = f.minPango ?? null;
  const appliesToLimit = input.appliesToLimit ?? DEFAULT_APPLIES_TO_FACET_LIMIT;

  const typesParam = types === null ? null : pgArray(types);
  const statusParam = status === null ? null : pgArray(status);
  const appliesToParam = appliesTo === null ? null : pgArray(appliesTo);

  // Each predicate is true when its filter is inactive, so a facet omits its own
  // by simply not AND-ing it in.
  const pKind = sql`(${kindPrefix}::ltree IS NULL OR m.kind <@ ${kindPrefix}::ltree)`;
  const pTypes = sql`(${typesParam}::text[] IS NULL OR m.type = ANY(${typesParam}::text[]))`;
  const pStatus = sql`(${statusParam}::text[] IS NULL OR m.status = ANY(${statusParam}::text[]))`;
  const pLang = sql`(${language}::text IS NULL OR m.language = ${language})`;
  const pApplies = sql`(${appliesToParam}::text[] IS NULL OR EXISTS (
    SELECT 1 FROM versions av WHERE av.doco_id = m.doco_id AND av.applies_to && ${appliesToParam}::text[]
  ))`;

  const result = (await db.execute(sql`
    WITH tsq AS (SELECT websearch_to_tsquery(${cfg}::regconfig, ${q}) AS query),
    matched AS (
      SELECT v.doco_id, v.kind, v.type, v.status, v.language, v.applies_to
      FROM versions v
      JOIN docos d ON d.id = v.doco_id
      WHERE v.is_latest AND v.status <> 'deprecated' AND d.deleted_at IS NULL
        AND NOT (v.kind <@ ${EXAMPLE_KIND_ROOT}::ltree)
        AND (${q} = '' OR v.search_tsv @@ (SELECT query FROM tsq))
        AND (NOT ${verifiedOnly}::boolean OR v.verification_score IS NOT NULL)
        AND (${minPango}::int IS NULL OR v.verification_score >= ${minPango}::int)
    )
    SELECT 'type' AS facet, m.type AS value, count(*)::int AS count
    FROM matched m WHERE ${pKind} AND ${pStatus} AND ${pLang} AND ${pApplies}
    GROUP BY m.type
    UNION ALL
    SELECT 'status', m.status, count(*)::int
    FROM matched m WHERE ${pKind} AND ${pTypes} AND ${pLang} AND ${pApplies}
    GROUP BY m.status
    UNION ALL
    SELECT 'language', m.language, count(*)::int
    FROM matched m WHERE ${pKind} AND ${pTypes} AND ${pStatus} AND ${pApplies}
    GROUP BY m.language
    UNION ALL
    SELECT 'applies_to', tag, count(*)::int
    FROM matched m, unnest(m.applies_to) AS tag
    WHERE ${pKind} AND ${pTypes} AND ${pStatus} AND ${pLang}
    GROUP BY tag
    UNION ALL
    SELECT 'kind', m.kind::text, count(*)::int
    FROM matched m WHERE ${pTypes} AND ${pStatus} AND ${pLang} AND ${pApplies}
    GROUP BY m.kind::text
    UNION ALL
    SELECT '__total__', '', count(*)::int
    FROM matched m WHERE ${pKind} AND ${pTypes} AND ${pStatus} AND ${pLang} AND ${pApplies}
  `)) as unknown as { rows: FacetRow[] };

  const facets: SearchFacets = {
    type: [],
    status: [],
    language: [],
    appliesTo: [],
    kind: [],
    total: 0,
  };

  for (const row of result.rows) {
    switch (row.facet) {
      case "type":
        facets.type.push({ value: row.value, count: row.count });
        break;
      case "status":
        facets.status.push({ value: row.value, count: row.count });
        break;
      case "language":
        facets.language.push({ value: row.value, count: row.count });
        break;
      case "applies_to":
        facets.appliesTo.push({ value: row.value, count: row.count });
        break;
      case "kind":
        facets.kind.push({ path: row.value, count: row.count });
        break;
      case "__total__":
        facets.total = row.count;
        break;
    }
  }

  // Most relevant first within each list; applies_to is capped to the busiest tags.
  facets.type.sort((a, b) => b.count - a.count);
  facets.status.sort((a, b) => b.count - a.count);
  facets.language.sort((a, b) => b.count - a.count);
  facets.appliesTo.sort((a, b) => b.count - a.count);
  facets.appliesTo = facets.appliesTo.slice(0, appliesToLimit);
  facets.kind.sort((a, b) => b.count - a.count);

  return facets;
}
