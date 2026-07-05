import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { stamps } from "$lib/server/db/schema";
import type { StampOutcome } from "./score";
import type { StampSource } from "./weights";

// Records a stamp into the append-only ledger. This is the single entry point
// the web UI calls now and the MCP server calls later. Token validation and rate
// limiting happen at the endpoint/MCP layer before this is called; this just
// appends. After it returns, schedule recomputeVersionScore(versionId) off the
// write path (for example via the platform's waitUntil), never inline.

export interface RecordStampInput {
  versionId: string;
  outcome: StampOutcome;
  source: StampSource;
  /** The verifier, when signed in; null/omitted for anonymous stamps. */
  voterUserId?: string | null;
  /** Optional short note, mainly to explain a "worked with caveats". */
  note?: string | null;
  /** Coarse, salted network bucket for clustering; never a raw IP. */
  networkBucket?: string | null;
  /** Nonce of the one-time vote token redeemed (MCP / link verification). Null
   * for web stamps. The unique index over non-null nonces makes it single-use. */
  voteTokenNonce?: string | null;
}

// Returns the new stamp's id, or null when a vote-token nonce was supplied and
// had already been redeemed (ON CONFLICT DO NOTHING on the unique nonce index).
// Web stamps carry no nonce, so they never conflict and always return an id.
export async function recordStamp(input: RecordStampInput): Promise<{ stampId: string } | null> {
  const rows = await db
    .insert(stamps)
    .values({
      versionId: input.versionId,
      outcome: input.outcome,
      source: input.source,
      voterUserId: input.voterUserId ?? null,
      note: input.note ?? null,
      networkBucket: input.networkBucket ?? null,
      voteTokenNonce: input.voteTokenNonce ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: stamps.id });
  return rows.length > 0 ? { stampId: rows[0].id } : null;
}

export interface RetractStampInput {
  versionId: string;
  /** The stamp to take back, from the reader's own local record of it. */
  stampId: string;
  /** The signed-in verifier, or null for an anonymous take-back. */
  voterUserId: string | null;
}

// Records an append-only take-back of a prior stamp (never a delete, so the
// ledger stays auditable and every historical score recomputable). Succeeds only
// when the stamp exists on this version and the caller is entitled to undo it: a
// signed-in voter may retract their own stamp; an anonymous reader retracts by
// presenting the stamp id handed back at stamp time (an unguessable UUID that
// never appears in the cached HTML, so possession is the capability). Idempotent:
// retracting an already-retracted stamp is a no-op success. The score recompute
// runs off the write path (the retraction is a fresh stamps row, so the cron
// picks the version up like any new stamp).
export async function retractStamp(input: RetractStampInput): Promise<{ ok: boolean }> {
  const found = await db
    .select({
      outcome: stamps.outcome,
      source: stamps.source,
      voterUserId: stamps.voterUserId,
      retractsStampId: stamps.retractsStampId,
    })
    .from(stamps)
    .where(and(eq(stamps.id, input.stampId), eq(stamps.versionId, input.versionId)))
    .limit(1);
  if (found.length === 0) return { ok: false };
  const target = found[0];
  // A take-back cannot itself be taken back.
  if (target.retractsStampId !== null) return { ok: false };
  // Authorization. A wrong signed-in owner or a non-anonymous target for an
  // anonymous caller looks the same as "not found" (don't confirm existence).
  if (input.voterUserId !== null) {
    if (target.voterUserId !== input.voterUserId) return { ok: false };
  } else if (target.voterUserId !== null) {
    return { ok: false };
  }
  // Idempotent: a concurrent double-retract just leaves two markers, which the
  // recompute set-dedupes, so this check is a courtesy, not a correctness gate.
  const already = await db
    .select({ id: stamps.id })
    .from(stamps)
    .where(eq(stamps.retractsStampId, input.stampId))
    .limit(1);
  if (already.length > 0) return { ok: true };
  await db.insert(stamps).values({
    versionId: input.versionId,
    outcome: target.outcome,
    source: target.source,
    voterUserId: target.voterUserId,
    retractsStampId: input.stampId,
  });
  return { ok: true };
}

/** Whether a one-time vote-token nonce has already been redeemed, so the verify
 * page can show the spent state at load instead of only after a failed submit. */
export async function isVoteTokenRedeemed(nonce: string): Promise<boolean> {
  const rows = await db
    .select({ id: stamps.id })
    .from(stamps)
    .where(eq(stamps.voteTokenNonce, nonce))
    .limit(1);
  return rows.length > 0;
}
