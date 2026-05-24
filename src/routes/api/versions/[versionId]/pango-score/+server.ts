import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { versions } from "$lib/server/db/schema";

// Live Pango Score for a version. The doco page HTML is long-cached, so it bakes
// a possibly-stale score; the viewer refetches this after hydration to update the
// number in place (cache-first: mutable public data hydrates client-side, so we
// never have to purge the doco page on a stamp or recompute).

// Structural uuid check (no regex per house style): right length and hyphen
// positions. Keeps an obviously-malformed id from reaching the uuid column.
function isUuid(value: string): boolean {
  return (
    value.length === 36 &&
    value[8] === "-" &&
    value[13] === "-" &&
    value[18] === "-" &&
    value[23] === "-"
  );
}

export const GET: RequestHandler = async ({ params, setHeaders }) => {
  if (!isUuid(params.versionId)) error(404);

  const rows = await db
    .select({
      score: versions.verificationScore,
      verifiedCount: versions.verificationStampCount,
      lastConfirmedAt: versions.verificationLastConfirmedAt,
    })
    .from(versions)
    .where(eq(versions.id, params.versionId))
    .limit(1);
  if (rows.length === 0) error(404);

  // Public and identical for every reader; a short edge cache keeps it fresh
  // enough while sparing the backend repeated reads.
  setHeaders({ "cache-control": "public, max-age=0, s-maxage=60" });
  return json({
    score: rows[0].score,
    verifiedCount: rows[0].verifiedCount,
    lastConfirmedAt: rows[0].lastConfirmedAt?.toISOString() ?? null,
  });
};
