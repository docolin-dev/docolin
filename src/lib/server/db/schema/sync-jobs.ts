import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { gitSources } from "./git-sources";
import { projects } from "./projects";

// Persisted Mintlify mode for an in-flight job, so each drain rebuilds the
// per-file context without re-detecting. Loosely typed here to keep the schema
// free of a cycle back to the sync engine; the engine casts on read.
export interface SyncJobMintlify {
  subpath: string | null;
  sitemap: unknown;
  iconLibrary: string;
}

// The immutable part of a planned sync, stored once when the job leaves 'pending'
// and read on every later drain. Mirrors the engine's SyncPlan minus the mutable
// `pending` cursor (its own column). The engine casts between this and SyncPlan.
export interface SyncJobPlan {
  isInitial: boolean;
  targetSha: string;
  baseSha: string | null;
  versionTag: string | null;
  mintlify: SyncJobMintlify | null;
  deletes: string[];
  renameOlds: string[];
  renamedCount: number;
  processedSeed: string[];
  changedSitemaps: { path: string; removed: boolean }[];
  configChanged: boolean;
}

// A resumable, crash-safe unit of sync work for one git source. A sync is no
// longer a single Worker invocation: it is chunked into a job that a drain loop
// advances across many bounded invocations (each well under the CPU budget), so
// a large diff can never evict mid-run and strand the source on "syncing".
//
// One row per source (the primary key on git_source_id is both the dedup and the
// lock): a burst of pushes collapses to a single job that re-plans to the latest
// HEAD. `lease_until` is the concurrency lock and the crash-recovery handle: the
// worker draining a chunk holds a short lease; if it dies, the lease lapses and
// the cron backstop reclaims the job and continues from `pending`.
export const syncJobs = pgTable(
  "sync_jobs",
  {
    gitSourceId: uuid("git_source_id")
      .primaryKey()
      .references(() => gitSources.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // 'pending'    -> not yet planned (resolve target, categorize the diff)
    // 'validating' -> checking every changed file (the atomic gate); a broken
    //                 file blocks the whole sync, nothing is written
    // 'processing' -> draining `pending` paths in budget-bounded batches
    // 'finalizing' -> all files processed; run deletes / sweep / sitemap / markIdle
    phase: text("phase")
      .notNull()
      .default("pending")
      .$type<"pending" | "validating" | "processing" | "finalizing">(),
    // A forced run re-processes the whole tree even when HEAD hasn't moved (dev
    // manual resync, project revive). OR'd across enqueues so a forced request is
    // never lost behind a plain one.
    force: boolean("force").notNull().default(false),
    // The immutable plan, written once when planning completes (null while pending).
    plan: jsonb("plan").$type<SyncJobPlan | null>(),
    // Mutable cursor: remaining upserts (shrinks as the job drains).
    pending: jsonb("pending")
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    // Accumulated across chunks: counts for the run result (seeded with the renames
    // done at plan time), changed paths for the edge-cache purge at finalize.
    counts: jsonb("counts")
      .notNull()
      .$type<Record<string, number>>()
      .default(sql`'{}'::jsonb`),
    changedPaths: jsonb("changed_paths")
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    // Bumped on every enqueue. If it moves past planned_at while a job runs, a push
    // landed mid-sync and the job re-plans to the new HEAD at finalize rather than
    // completing.
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    // The worker draining this job holds the lease until this time. Null = free.
    // A lapsed lease is reclaimable (crash recovery).
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    // Consecutive chunk failures; a poison job is marked error and dropped at the
    // cap so it can't spin forever.
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The cron backstop scans for free / lapsed leases to reclaim.
    index("sync_jobs_lease_until_idx").on(t.leaseUntil),
    check(
      "sync_jobs_phase_check",
      sql`${t.phase} IN ('pending', 'validating', 'processing', 'finalizing')`,
    ),
  ],
);
