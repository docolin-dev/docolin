import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
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
  waitUntil(
    fetch(`${origin}/api/sync/drain`, {
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
      // No-op idle / error / rate-limited already written by buildPlan.
      await deleteJob(job.gitSourceId);
      return false;
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
        plannedAt: new Date(),
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
      return await concludeOrReplan(job.gitSourceId, async () => {
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
  return await concludeOrReplan(job.gitSourceId);
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
    await markError(
      job.gitSourceId,
      "The sync failed repeatedly. Try resyncing, and report it if it keeps happening.",
      ZERO_COUNTS,
    );
    await deleteJob(job.gitSourceId);
    return false;
  }
  // Bump attempts and free the lease so the next kick / cron tick retries.
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
// the plan (requestedAt moved past plannedAt), it re-plans instead so the new HEAD
// is re-validated. The conditional delete is atomic, so a concurrent enqueue
// between the check and the delete can't be lost.
async function concludeOrReplan(
  gitSourceId: string,
  onConcluded?: () => Promise<void>,
): Promise<boolean> {
  const deleted = await db
    .delete(syncJobs)
    .where(
      and(eq(syncJobs.gitSourceId, gitSourceId), lte(syncJobs.requestedAt, syncJobs.plannedAt)),
    )
    .returning({ gitSourceId: syncJobs.gitSourceId });
  if (deleted.length > 0) {
    await onConcluded?.();
    return false;
  }
  await db
    .update(syncJobs)
    .set({
      phase: "pending",
      plan: null,
      pending: [],
      counts: {},
      changedPaths: [],
      attempts: 0,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(syncJobs.gitSourceId, gitSourceId));
  return true;
}

async function deleteJob(gitSourceId: string): Promise<void> {
  await db.delete(syncJobs).where(eq(syncJobs.gitSourceId, gitSourceId));
}
