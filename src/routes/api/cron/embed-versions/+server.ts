import { error, json } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { requireEnv } from "$lib/server/env";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { versions } from "$lib/server/db/schema";
import { buildEmbedText, embedText } from "$lib/search/embed";

// Cron-triggered embedding backfill. Computes the dense vector for latest
// versions that don't have one yet (just published, content re-synced, or
// pre-dating the column), off the sync hot path. Lexical search works without
// it, so this fills in the semantic half of hybrid search as a batch.
//
// Auth: shared secret in the Authorization header, same as the other cron
// endpoints. The scheduler hits this with `Authorization: Bearer {CRON_SECRET}`.

const TICK_BUDGET_MS = 25_000;
const MAX_VERSIONS_PER_TICK = 50;

export const POST: RequestHandler = async ({ request, platform }) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${requireEnv("CRON_SECRET")}`) error(401, "unauthorized");

  const ai = platform?.env.AI;
  if (ai === undefined) error(500, "AI binding unavailable");

  const pending = await db
    .select({
      id: versions.id,
      title: versions.title,
      description: versions.description,
      bodyText: versions.bodyText,
    })
    .from(versions)
    .where(and(eq(versions.isLatest, true), isNull(versions.embedding)))
    .limit(MAX_VERSIONS_PER_TICK);

  const startedAt = Date.now();
  const summary = { embedded: 0, failed: 0, deferred: 0 };
  for (const row of pending) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) {
      summary.deferred = pending.length - summary.embedded - summary.failed;
      break;
    }
    // One external model call per version. A transient model/network failure
    // should skip this version (the next tick retries it, since the embedding
    // stays null) rather than abort the whole batch.
    try {
      const vector = await embedText(ai, buildEmbedText(row));
      await db.update(versions).set({ embedding: vector }).where(eq(versions.id, row.id));
      summary.embedded += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return json(summary);
};
