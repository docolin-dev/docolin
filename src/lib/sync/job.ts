import { and, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { R2Bucket } from "@cloudflare/workers-types";
import { db } from "$lib/server/db";
import { gitSources, syncJobs, type SyncJobPlan } from "$lib/server/db/schema";
import { env } from "$lib/server/env";
import {
  atomicGateMessage,
  buildPlan,
  finalizePlan,
  loadSyncContext,
  markError,
  mergeCounts,
  planErrorCount,
  processPlanBatch,
  validatePlanBatch,
  ZERO_COUNTS,
  type SyncPlan,
  type SyncRunCounts,
} from "./run";

// A sync is chunked into a sync_jobs row that a drain loop advances one bounded
// chunk per invocation, so a large diff never evicts mid-run. enqueueSync is the
// single entry point for every trigger (webhook, resync, project-create, cron);
// drainSyncJob does the work, kicked immediately on enqueue and continued by the
// cron backstop after a crash.

// How long a worker owns a job while draining one chunk. A lapsed lease means the
// worker died mid-chunk; the cron backstop reclaims it.
const LEASE_MS = 90_000;
// Wall-clock budget for processing files in one chunk, well under the Worker CPU
// cap. Remaining work continues in the next invocation.
const CHUNK_BUDGET_MS = 15_000;
// Files per processPlanBatch call. Small so a chunk overshoots the budget by at
// most one batch, and large enough to share the sitemap resolver cache.
const BATCH_SIZE = 4;
// Consecutive chunk failures before a job is marked error and dropped.
const MAX_ATTEMPTS = 5;

type SyncJobRow = typeof syncJobs.$inferSelect;

// ---------- enqueue ----------

export interface EnqueueOptions {
  force?: boolean;
  // Origin of the running worker (e.g. https://docolin.com), used to self-fetch
  // the drain endpoint.
  origin: string;
  waitUntil: (promise: Promise<unknown>) => void;
}

// Queues (or refreshes) a sync for a project's git source and kicks an immediate
// drain. Idempotent: a burst of pushes collapses to one job (PK on git_source_id)
// that re-plans to the latest HEAD. Cheap so a webhook / resync returns at once.
// A native project (no git source) is a no-op.
export async function enqueueSync(projectId: string, opts: EnqueueOptions): Promise<void> {
  const force = opts.force ?? false;
  const sources = await db
    .select({ id: gitSources.id })
    .from(gitSources)
    .where(eq(gitSources.projectId, projectId))
    .limit(1);
  if (sources.length === 0) return;
  const gitSourceId = sources[0].id;
  const now = new Date();

  await db
    .insert(syncJobs)
    .values({ gitSourceId, projectId, force, requestedAt: now })
    .onConflictDoUpdate({
      target: syncJobs.gitSourceId,
      set: { force: sql`${syncJobs.force} or ${force}`, requestedAt: now, updatedAt: now },
    });
  await db
    .update(gitSources)
    .set({ syncStatus: "syncing", updatedAt: now })
    .where(eq(gitSources.id, gitSourceId));

  kickDrain(gitSourceId, opts.origin, opts.waitUntil);
}

// Fire-and-forget POST to the drain endpoint: a fresh full-budget invocation picks
// up the job. Skipped when CRON_SECRET is unset (dev without the secret); the cron
// backstop is then the only driver.
function kickDrain(
  gitSourceId: string,
  origin: string,
  waitUntil: (promise: Promise<unknown>) => void,
): void {
  const secret = env.CRON_SECRET;
  if (!secret) return;
  // The CRON_SECRET bearer must only ever go to our own origin, never a
  // request-derived Host a client could spoof. Prefer the configured APP_ORIGIN;
  // in dev (unset) fall back to the request origin only when it is loopback. No
  // trusted target => skip the kick loudly; the durable job still drains on the
  // cron backstop, so we degrade safely instead of leaking the secret.
  const base = drainOrigin(origin);
  if (base === null) {
    console.error("sync: no trusted drain origin (set APP_ORIGIN); cron backstop will drain", {
      gitSourceId,
    });
    return;
  }
  waitUntil(
    fetch(`${base}/api/sync/drain`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ gitSourceId }),
    })
      .then(() => undefined)
      .catch((err: unknown) => {
        console.error("sync drain kick failed", { gitSourceId, detail: String(err) });
      }),
  );
}

// Resolves the origin the secret-bearing drain self-kick may target: APP_ORIGIN
// when configured, else the request origin but only when it is loopback (local
// dev). Returns null when neither is safe, so the caller skips the kick rather
// than send the secret to an untrusted Host.
function drainOrigin(requestOrigin: string): string | null {
  if (env.APP_ORIGIN) return env.APP_ORIGIN;
  const host = new URL(requestOrigin).hostname;
  if (host === "localhost" || host === "127.0.0.1") return requestOrigin;
  return null;
}

// Cron backstop: kick a drain for every job whose lease is free or lapsed (a
// crashed worker mid-chunk, or a job whose self-kick fetch was dropped). Bounded
// per tick. Jobs actively draining hold an unexpired lease and are skipped.
export async function reclaimStalledJobs(
  origin: string,
  waitUntil: (promise: Promise<unknown>) => void,
  limit: number,
): Promise<number> {
  const now = new Date();
  const stalled = await db
    .select({ gitSourceId: syncJobs.gitSourceId })
    .from(syncJobs)
    .where(or(isNull(syncJobs.leaseUntil), lt(syncJobs.leaseUntil, now)))
    .limit(limit);
  for (const row of stalled) {
    kickDrain(row.gitSourceId, origin, waitUntil);
  }
  return stalled.length;
}

// ---------- drain ----------

// Advances one job by a single bounded chunk: claim the lease, run the current
// phase, persist progress, then self-kick if work remains. The lease (one drain
// per source) plus commit-SHA-idempotent file processing make a crashed chunk
// safe to retry.
export async function drainSyncJob(
  gitSourceId: string,
  bucket: R2Bucket,
  origin: string,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<void> {
  const now = new Date();
  const claimed = await db
    .update(syncJobs)
    .set({ leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now })
    .where(
      and(
        eq(syncJobs.gitSourceId, gitSourceId),
        or(isNull(syncJobs.leaseUntil), lt(syncJobs.leaseUntil, now)),
      ),
    )
    .returning();
  if (claimed.length === 0) return; // no job, or another worker holds the lease
  const job = claimed[0];

  try {
    const more = await runDrainStep(job, bucket);
    if (more) kickDrain(gitSourceId, origin, waitUntil);
  } catch (err) {
    const retry = await handleDrainFailure(job, err);
    if (retry) kickDrain(gitSourceId, origin, waitUntil);
  }
}

// Runs the phase the job is in and returns whether more work remains (so the
// caller self-kicks). Each call does at most one plan, one processing chunk, or
// one finalize.
async function runDrainStep(job: SyncJobRow, bucket: R2Bucket): Promise<boolean> {
  const loaded = await loadSyncContext(job.projectId, bucket);
  if ("terminal" in loaded) {
    // Project gone / deleted / unsupported: the loader already wrote terminal
    // state. Drop the job.
    await deleteJob(job.gitSourceId);
    return false;
  }
  const { ctx, lastSyncedCommit } = loaded;

  if (job.phase === "pending") {
    const planned = await buildPlan(ctx, lastSyncedCommit, job.force);
    if (planned.kind === "terminal") {
      // No-op idle / error / rate-limited already written by buildPlan. Conclude
      // the job, unless a push landed during buildPlan (requestedAt moved past
      // the claim) in which case replan to the new HEAD rather than dropping it.
      return await concludeOrReplan(job.gitSourceId, job.requestedAt);
    }
    const plan = planned.plan;
    const stored: SyncJobPlan = {
      isInitial: plan.isInitial,
      targetSha: plan.targetSha,
      baseSha: plan.baseSha,
      versionTag: plan.versionTag,
      mintlify: plan.mintlify,
      deletes: plan.deletes,
      renameOlds: plan.renameOlds,
      renamedCount: plan.renamedCount,
      processedSeed: plan.processedSeed,
      changedSitemaps: plan.changedSitemaps,
      configChanged: plan.configChanged,
    };
    // Seed the accumulated counts with the renames already done at plan time.
    const seedCounts: SyncRunCounts = { ...ZERO_COUNTS, renamed: plan.renamedCount };
    await db
      .update(syncJobs)
      .set({
        phase: plan.pending.length > 0 ? "validating" : "finalizing",
        plan: stored,
        pending: plan.pending,
        counts: countsToRecord(seedCounts),
        changedPaths: [],
        // The request watermark this plan was built for, NOT wall-clock plan
        // time: a push arriving during buildPlan advances requestedAt past this,
        // so finalize re-plans to the new HEAD instead of treating it as covered
        // and dropping it.
        plannedAt: job.requestedAt,
        // Release the lease so the self-kick's fresh drain can claim and continue;
        // the lease is held only during an executing chunk.
        leaseUntil: null,
        attempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.gitSourceId, job.gitSourceId));
    return true;
  }

  if (job.plan === null) {
    // Defensive: processing / finalizing imply a plan. Reset to re-plan.
    await db
      .update(syncJobs)
      .set({ phase: "pending", updatedAt: new Date() })
      .where(eq(syncJobs.gitSourceId, job.gitSourceId));
    return true;
  }

  if (job.phase === "validating") {
    // The atomic gate: validate the changed files in budget-bounded batches. No
    // versions are written here; a broken file blocks the whole sync.
    const plan = planFromJob(job.plan, job.pending);
    const remaining = [...job.pending];
    const deadline = Date.now() + CHUNK_BUDGET_MS;
    while (remaining.length > 0 && Date.now() < deadline) {
      const batchPaths = remaining.splice(0, BATCH_SIZE);
      await validatePlanBatch(ctx, plan, batchPaths);
    }
    if (remaining.length > 0) {
      // More to validate; persist the cursor and continue next chunk.
      await db
        .update(syncJobs)
        .set({ pending: remaining, leaseUntil: null, attempts: 0, updatedAt: new Date() })
        .where(eq(syncJobs.gitSourceId, job.gitSourceId));
      return true;
    }
    // Whole set validated. If anything is broken, abort (write nothing, leave
    // lastSyncedCommit); a push that arrived during validation re-plans instead.
    const errorCount = await planErrorCount(job.projectId, plan.processedSeed);
    if (errorCount > 0) {
      return await concludeOrReplan(job.gitSourceId, null, async () => {
        await markError(job.gitSourceId, atomicGateMessage(errorCount), ZERO_COUNTS);
      });
    }
    // All clean: commit. Reset pending to the full upsert set for processing.
    await db
      .update(syncJobs)
      .set({
        phase: "processing",
        pending: plan.processedSeed,
        leaseUntil: null,
        attempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.gitSourceId, job.gitSourceId));
    return true;
  }

  if (job.phase === "processing") {
    const plan = planFromJob(job.plan, job.pending);
    const counts = countsFromJob(job.counts);
    const changedPaths = [...job.changedPaths];
    const remaining = [...job.pending];
    const deadline = Date.now() + CHUNK_BUDGET_MS;
    while (remaining.length > 0 && Date.now() < deadline) {
      const batchPaths = remaining.splice(0, BATCH_SIZE);
      const batch = await processPlanBatch(ctx, plan, batchPaths);
      mergeCounts(counts, batch.counts);
      changedPaths.push(...batch.changedPaths);
    }
    const done = remaining.length === 0;
    await db
      .update(syncJobs)
      .set({
        phase: done ? "finalizing" : "processing",
        pending: remaining,
        counts: countsToRecord(counts),
        changedPaths,
        // Release the lease so the self-kick's fresh drain can claim and continue;
        // the lease is held only during an executing chunk.
        leaseUntil: null,
        attempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.gitSourceId, job.gitSourceId));
    return true;
  }

  // phase === "finalizing"
  const plan = planFromJob(job.plan, []);
  const counts = countsFromJob(job.counts);
  const changedPaths = [...job.changedPaths];
  await finalizePlan(ctx, plan, counts, changedPaths);

  // Conclude on success, or re-plan if a push arrived during this sync.
  return await concludeOrReplan(job.gitSourceId, null);
}

async function handleDrainFailure(job: SyncJobRow, err: unknown): Promise<boolean> {
  const detail = err instanceof Error ? err.message : String(err);
  console.error("sync drain chunk failed", {
    gitSourceId: job.gitSourceId,
    phase: job.phase,
    attempts: job.attempts,
    detail,
  });
  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    // Out of retries: mark the source errored and drop the job, UNLESS a push
    // arrived since we claimed it (requestedAt moved past the watermark) in which
    // case replan to the new HEAD instead of erroring out and losing it. The
    // delete-or-replan is atomic, so a push landing right here can't be dropped.
    return await concludeOrReplan(job.gitSourceId, job.requestedAt, async () => {
      await markError(
        job.gitSourceId,
        "The sync failed repeatedly. Try resyncing, and report it if it keeps happening.",
        ZERO_COUNTS,
      );
    });
  }
  // Transient failure: replan if a newer push landed, otherwise bump attempts and
  // free the lease so the next kick / cron tick retries the same plan (a push that
  // lands later is still caught by the finalize-time replan).
  if (await replanIfSuperseded(job.gitSourceId, job.requestedAt)) return true;
  await db
    .update(syncJobs)
    .set({ attempts, leaseUntil: null, updatedAt: new Date() })
    .where(eq(syncJobs.gitSourceId, job.gitSourceId));
  return true;
}

function planFromJob(stored: SyncJobPlan, pending: string[]): SyncPlan {
  return { ...stored, pending, mintlify: stored.mintlify as unknown as SyncPlan["mintlify"] };
}

function countsFromJob(c: Record<string, number | undefined>): SyncRunCounts {
  return {
    created: c.created ?? 0,
    updated: c.updated ?? 0,
    deleted: c.deleted ?? 0,
    renamed: c.renamed ?? 0,
    errored: c.errored ?? 0,
  };
}

// An object literal so the named SyncRunCounts (no index signature) stores into
// the Record<string, number> jsonb column.
function countsToRecord(c: SyncRunCounts): Record<string, number> {
  return {
    created: c.created,
    updated: c.updated,
    deleted: c.deleted,
    renamed: c.renamed,
    errored: c.errored,
  };
}

// Concludes a drained job: onConcluded runs the terminal effect (nothing on a
// clean success, markError on an aborted validate). But if a push arrived since
// the plan, it re-plans instead so the new HEAD is picked up. The conditional
// delete is atomic, so a concurrent enqueue between the check and the delete
// can't be lost.
//
// watermark fixes the cutoff: a Date pins it to the drain's claim time (the
// pending-phase terminal, before a plan and its plannedAt exist); null compares
// against the row's plannedAt, the requestedAt the active plan was built for
// (validate / finalize).
async function concludeOrReplan(
  gitSourceId: string,
  watermark: Date | null,
  onConcluded?: () => Promise<void>,
): Promise<boolean> {
  const covered =
    watermark === null
      ? lte(syncJobs.requestedAt, syncJobs.plannedAt)
      : lte(syncJobs.requestedAt, watermark);
  const deleted = await db
    .delete(syncJobs)
    .where(and(eq(syncJobs.gitSourceId, gitSourceId), covered))
    .returning({ gitSourceId: syncJobs.gitSourceId });
  if (deleted.length > 0) {
    await onConcluded?.();
    return false;
  }
  await replanJob(gitSourceId);
  return true;
}

// Resets a job to re-plan from the current HEAD and restores the syncing badge,
// which a concluded attempt's markIdle / markError may have cleared.
async function replanJob(gitSourceId: string): Promise<void> {
  await db.update(syncJobs).set(resetToPendingSet()).where(eq(syncJobs.gitSourceId, gitSourceId));
  await markSyncing(gitSourceId);
}

// Atomically replans only when a newer enqueue advanced requestedAt past the
// claim watermark; returns whether it did. Used on chunk failure so a push that
// lands mid-failure isn't lost behind retries of a now-stale plan.
async function replanIfSuperseded(gitSourceId: string, watermark: Date): Promise<boolean> {
  const rows = await db
    .update(syncJobs)
    .set(resetToPendingSet())
    .where(and(eq(syncJobs.gitSourceId, gitSourceId), gt(syncJobs.requestedAt, watermark)))
    .returning({ gitSourceId: syncJobs.gitSourceId });
  if (rows.length === 0) return false;
  await markSyncing(gitSourceId);
  return true;
}

// The reset that returns a job to the pending phase, discarding the stale plan
// and its cursors so the next drain re-plans from HEAD.
function resetToPendingSet(): {
  phase: "pending";
  plan: null;
  pending: string[];
  counts: Record<string, number>;
  changedPaths: string[];
  attempts: number;
  leaseUntil: null;
  updatedAt: Date;
} {
  return {
    phase: "pending",
    plan: null,
    pending: [],
    counts: {},
    changedPaths: [],
    attempts: 0,
    leaseUntil: null,
    updatedAt: new Date(),
  };
}

async function markSyncing(gitSourceId: string): Promise<void> {
  await db
    .update(gitSources)
    .set({ syncStatus: "syncing", updatedAt: new Date() })
    .where(eq(gitSources.id, gitSourceId));
}

async function deleteJob(gitSourceId: string): Promise<void> {
  await db.delete(syncJobs).where(eq(syncJobs.gitSourceId, gitSourceId));
}
