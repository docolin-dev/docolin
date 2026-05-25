import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgMaterializedView,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { gitSources } from "./git-sources";
import { projects } from "./projects";
import { ltree, tsvector } from "./types";
import { users } from "./users";

// Stable doco identity. Belongs to a project (which is owned by an org).
// `git_source_id` and `path_in_source` are denormalized from the project's
// source for the sync hot-path; they let "did this file come from that git
// source?" lookups skip the project join.
export const docos = pgTable(
  "docos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    gitSourceId: uuid("git_source_id").references(() => gitSources.id, {
      onDelete: "set null",
    }),
    pathInSource: text("path_in_source"),
    latestPublishedVersionId: uuid("latest_published_version_id"),
    // Monotonic counter for assigning per-doco discussion numbers (the #N in
    // discussion URLs, GitHub-issue style). Incremented atomically when a
    // discussion is created; only ever grows, so deletes leave gaps, which is
    // fine. Not the live discussion count.
    discussionSeq: integer("discussion_seq").notNull().default(0),
    // Set when a synced file is removed from the source repo. Version rows
    // stay; the renderer surfaces this as a "removed from source" badge but
    // the doco URL still resolves. Cleared when the file reappears at the
    // same path in a later commit (un-delete).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("docos_project_idx").on(t.projectId),
    index("docos_git_source_idx").on(t.gitSourceId),
    uniqueIndex("docos_git_source_path_unique")
      .on(t.gitSourceId, t.pathInSource)
      .where(sql`${t.gitSourceId} IS NOT NULL AND ${t.pathInSource} IS NOT NULL`),
    // Partial index: live docos are the hot path. Deleted docos are rare and
    // skipped on most queries.
    index("docos_deleted_at_idx")
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} IS NOT NULL`),
  ],
);

// One row per published version of a doco. Frontmatter fields are first-class columns
// so anything in them is queryable; `frontmatterExtra` catches unknown keys from
// migrated formats so they survive round-trips without polluting the queryable surface.
export const versions = pgTable(
  "versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    docoId: uuid("doco_id")
      .notNull()
      .references(() => docos.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    // Full git commit SHA the content was synced from. Stored as the source
    // of truth for "which revision is this?", displayed as a short prefix
    // when no tag is present. Nullable for pre-existing rows; new versions
    // written by the sync layer always carry it.
    commitSha: text("commit_sha"),
    // Git tag pointing at commitSha, if any (preferred display). The first
    // matching tag from /repos/{owner}/{repo}/tags wins when several point
    // at the same commit.
    versionTag: text("version_tag"),
    kind: ltree("kind").notNull(),
    type: text("type").notNull().$type<"tutorial" | "how-to" | "reference" | "explanation">(),
    title: text("title").notNull(),
    description: text("description"),
    appliesTo: text("applies_to")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text("status")
      .notNull()
      .default("stable")
      .$type<"draft" | "stable" | "needs-update" | "deprecated">(),
    language: text("language").notNull().default("en"),
    difficulty: text("difficulty").$type<"beginner" | "intermediate" | "advanced" | "expert">(),
    timeEstimateMinMinutes: integer("time_estimate_min_minutes"),
    timeEstimateMaxMinutes: integer("time_estimate_max_minutes"),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    prevLink: text("prev_link"),
    nextLink: text("next_link"),
    supersededBy: text("superseded_by"),
    references: text("references")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Author attribution list. Each entry is either { userId: uuid } for docolin
    // users (handle resolved at parse time) or { name, username?, url? } for external
    // attribution. See docs/frontmatter-format.md `authors` field.
    authors: jsonb("authors")
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Resolved sitemap for this version: either the per-doco override from
    // frontmatter, or the nearest doco_sitemap.yaml cascading up the docs tree,
    // resolved at sync time. Recursive { title, url?, children? } shape with
    // url xor children per entry.
    sitemap: jsonb("sitemap"),
    frontmatterExtra: jsonb("frontmatter_extra")
      .notNull()
      .default(sql`'{}'::jsonb`),

    // Body.
    bodyText: text("body_text").notNull(),
    bodyFormat: text("body_format")
      .notNull()
      .default("commonmark")
      .$type<"commonmark" | "asciidoc" | "rst" | "mdx">(),

    // Verification aggregate, recomputed from the stamps ledger off the write
    // path. verificationScore is the 0-1000 reliability number, null until the
    // guide clears the minimum-evidence gate ("not verified yet"). stampCount is
    // the raw number of stamps behind it; lastConfirmedAt is the most recent
    // worked / worked-with-caveats stamp (for "last confirmed working N ago").
    verificationScore: integer("verification_score"),
    // Ungated, history-aware ranking estimate (0-1000) that search ranks on. It
    // shrinks toward a prior that regresses the previous version's estimate
    // toward the global mean, so publishing a fresh version does not reset the
    // guide's ranking to zero. Honest display still uses verificationScore. See
    // tmp/docolin-verification.md 4.8.
    verificationRankingScore: integer("verification_ranking_score"),
    verificationStampCount: integer("verification_stamp_count").notNull().default(0),
    verificationLastConfirmedAt: timestamp("verification_last_confirmed_at", {
      withTimezone: true,
    }),
    verificationComputedAt: timestamp("verification_computed_at", { withTimezone: true }),

    // Whether this is the latest published version of its doco. Maintained in
    // the sync/publish path alongside docos.latestPublishedVersionId so the
    // search indexes below can be partial (WHERE is_latest), staying small and
    // instantly fresh with no materialized-view refresh.
    isLatest: boolean("is_latest").notNull().default(false),

    // Search.
    // Dense embedding for semantic retrieval (Cloudflare Workers AI bge-m3,
    // 1024-dim), computed off the write path by the embed cron; null until
    // embedded, and nulled again when the body changes so it gets re-embedded.
    embedding: vector("embedding", { dimensions: 1024 }),
    // Weighted full-text vector for the lexical spine, maintained by the DB. The
    // logic lives in the immutable SQL function docolin_search_tsv (a DB
    // prerequisite created alongside the pg_trgm extension), because folding the
    // text[] fields with array_to_string is not immutable enough to inline in a
    // generated column. English is the one stemmed language (the primary content
    // language; versions.language defaults to 'en'); every other language uses
    // `simple` (language-neutral), with the bge-m3 dense vector carrying cross-
    // language recall. Weights: title + aliases = A, description = B, applies_to
    // = C, body = D. The app never writes this; the GIN index over it is the
    // lexical spine.
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`docolin_search_tsv(language, title, aliases, description, applies_to, body_text)`,
    ),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("versions_doco_version_unique").on(t.docoId, t.versionNumber),
    index("versions_commit_sha_idx").on(t.commitSha),
    index("versions_doco_idx").on(t.docoId),
    index("versions_kind_gist").using("gist", t.kind),
    index("versions_status_idx").on(t.status),
    index("versions_type_idx").on(t.type),
    index("versions_language_idx").on(t.language),
    index("versions_published_at_idx").on(t.publishedAt.desc()),
    // Partial search indexes: only the latest published version of each doco is
    // indexed (WHERE is_latest), so they stay small and need no MV refresh. The
    // lexical spine is the GIN over search_tsv; prefix/fuzzy trigram indexes are
    // deferred until the query actually uses them (they would also need an
    // immutable array-folding function for the aliases case).
    index("versions_search_tsv_gin")
      .using("gin", t.searchTsv)
      .where(sql`${t.isLatest} = true`),
    index("versions_embedding_hnsw")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .with({ m: 16, ef_construction: 200 })
      .where(sql`${t.isLatest} = true`),
    index("versions_applies_to_gin")
      .using("gin", t.appliesTo)
      .where(sql`${t.isLatest} = true`),
    check(
      "versions_type_check",
      sql`${t.type} IN ('tutorial', 'how-to', 'reference', 'explanation')`,
    ),
    check(
      "versions_status_check",
      sql`${t.status} IN ('draft', 'stable', 'needs-update', 'deprecated')`,
    ),
    check(
      "versions_difficulty_check",
      sql`${t.difficulty} IS NULL OR ${t.difficulty} IN ('beginner', 'intermediate', 'advanced', 'expert')`,
    ),
    check(
      "versions_body_format_check",
      sql`${t.bodyFormat} IN ('commonmark', 'asciidoc', 'rst', 'mdx')`,
    ),
    check(
      "versions_time_estimate_range_check",
      sql`${t.timeEstimateMinMinutes} IS NULL OR ${t.timeEstimateMaxMinutes} IS NULL OR ${t.timeEstimateMaxMinutes} >= ${t.timeEstimateMinMinutes}`,
    ),
  ],
);

// Materialized projection of the latest published version per doco. Search indexes
// (HNSW for embeddings, BM25 via pg_search) and the refresh trigger are added in a
// follow-up migration when the search query layer is wired up; the projection itself
// is defined here so the type is known and the table is in place from the start.
//
// Defined with explicit column types + raw SQL because Drizzle's query-builder form
// doesn't apply field aliases inside materialized views (both `docos.id` and
// `versions.id` would collide as `id` in the resulting view).
export const latestVersions = pgMaterializedView("latest_versions", {
  docoId: uuid("doco_id").notNull(),
  versionId: uuid("version_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  kind: ltree("kind").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  appliesTo: text("applies_to").array().notNull(),
  status: text("status").notNull(),
  language: text("language").notNull(),
  difficulty: text("difficulty"),
  timeEstimateMinMinutes: integer("time_estimate_min_minutes"),
  timeEstimateMaxMinutes: integer("time_estimate_max_minutes"),
  aliases: text("aliases").array().notNull(),
  prevLink: text("prev_link"),
  nextLink: text("next_link"),
  supersededBy: text("superseded_by"),
  references: text("references").array().notNull(),
  authors: jsonb("authors").notNull(),
  sitemap: jsonb("sitemap"),
  bodyText: text("body_text").notNull(),
  bodyFormat: text("body_format").notNull(),
  verificationScore: integer("verification_score"),
  verificationRankingScore: integer("verification_ranking_score"),
  verificationStampCount: integer("verification_stamp_count").notNull(),
  verificationLastConfirmedAt: timestamp("verification_last_confirmed_at", { withTimezone: true }),
  embedding: vector("embedding", { dimensions: 1024 }),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
}).as(
  sql`
    SELECT
      d.id AS doco_id,
      v.id AS version_id,
      v.version_number,
      v.kind,
      v.type,
      v.title,
      v.description,
      v.applies_to,
      v.status,
      v.language,
      v.difficulty,
      v.time_estimate_min_minutes,
      v.time_estimate_max_minutes,
      v.aliases,
      v.prev_link,
      v.next_link,
      v.superseded_by,
      v.references,
      v.authors,
      v.sitemap,
      v.body_text,
      v.body_format,
      v.verification_score,
      v.verification_ranking_score,
      v.verification_stamp_count,
      v.verification_last_confirmed_at,
      v.embedding,
      v.published_at
    FROM docos d
    INNER JOIN versions v ON v.id = d.latest_published_version_id
  `,
);
