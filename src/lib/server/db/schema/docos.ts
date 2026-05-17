import { sql } from "drizzle-orm";
import {
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
import { ltree } from "./types";
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
    // frontmatter, or the project-wide docolin/sitemap.yaml at sync time.
    // Recursive { title, url?, children? } shape with url xor children per entry.
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

    // Vote cache. Backing per-vote rows are deferred until the verification
    // mechanism is designed; this contract is what readers consume.
    upVotesCache: integer("up_votes_cache").notNull().default(0),
    downVotesCache: integer("down_votes_cache").notNull().default(0),

    // Search.
    embedding: vector("embedding", { dimensions: 1536 }),

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
  upVotesCache: integer("up_votes_cache").notNull(),
  downVotesCache: integer("down_votes_cache").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
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
      v.up_votes_cache,
      v.down_votes_cache,
      v.embedding,
      v.published_at
    FROM docos d
    INNER JOIN versions v ON v.id = d.latest_published_version_id
  `,
);
