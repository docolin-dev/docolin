import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { kinds } from "$lib/server/db/schema";
import { TECHNICAL_ROOTS, GENERAL_ROOTS } from "$lib/reserved-handles";

// The browse landing: the taxonomy's top-level kinds as a card grid, the entry
// point into the per-kind browse pages. The root list is a compile-time constant
// (reserved-handles), so the only data the page needs is per-root doco counts and
// the registry descriptions, both of which move slowly. That keeps the response
// reader-independent and safe to cache hard at the edge: the queries below run on
// a cache miss, not per reader, and a count being a few hours stale is fine for a
// directory. New roots only ship with a code change, which busts the cache anyway.

interface RootCard {
  root: string;
  description: string | null;
  count: number;
}

export const load: PageServerLoad = async ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
  });

  // One grouped scan for counts (each version rolled up to its top-level ancestor
  // via subpath), plus the registry rows for the roots. The "listable doco"
  // predicate matches search/facets so the numbers agree across the site.
  const [countResult, descRows] = await Promise.all([
    db.execute(sql`
      SELECT subpath(v.kind, 0, 1)::text AS root, count(*)::int AS count
      FROM versions v
      JOIN docos d ON d.id = v.doco_id
      WHERE v.is_latest AND v.status <> 'deprecated' AND d.deleted_at IS NULL
      GROUP BY 1
    `),
    db
      .select({ key: kinds.displayPath, description: kinds.description })
      .from(kinds)
      .where(sql`nlevel(${kinds.path}) = 1`),
  ]);

  const counts = new Map<string, number>();
  for (const row of (countResult as unknown as { rows: { root: string; count: number }[] }).rows) {
    counts.set(row.root, row.count);
  }
  const descriptions = new Map<string, string | null>();
  for (const row of descRows) descriptions.set(row.key, row.description);

  const toCard = (root: string): RootCard => ({
    root,
    description: descriptions.get(root) ?? null,
    count: counts.get(root) ?? 0,
  });

  return {
    technical: TECHNICAL_ROOTS.map(toCard),
    general: GENERAL_ROOTS.map(toCard),
  };
};
