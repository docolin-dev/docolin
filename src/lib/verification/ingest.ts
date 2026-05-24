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
}

export async function recordStamp(input: RecordStampInput): Promise<{ stampId: string }> {
  const [row] = await db
    .insert(stamps)
    .values({
      versionId: input.versionId,
      outcome: input.outcome,
      source: input.source,
      voterUserId: input.voterUserId ?? null,
      note: input.note ?? null,
      networkBucket: input.networkBucket ?? null,
    })
    .returning({ id: stamps.id });
  return { stampId: row.id };
}
