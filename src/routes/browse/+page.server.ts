import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { kinds } from "$lib/server/db/schema";
import { TAXONOMY_ROOTS_LIST } from "$lib/reserved-handles";
import { EXAMPLE_KIND_ROOT } from "$lib/sync/frontmatter-schema";
import { getBrowseFeed } from "$lib/server/browse";

// The browse landing: what's moving on docolin (trending by verification +
// discussion activity, fresh publishes, a daily serendipity pool), with the
// taxonomy root index demoted to a compact directory below. Everything is
// reader-independent, one cached payload for all; the "for your setup" slice
// is picked client-side from the shipped pool. Activity moves faster than the
// old directory did, so the edge TTL is an hour (was a day), still cache-miss
// economics, never per-reader compute.

export interface RootCard {
  root: string;
  description: string | null;
  count: number;
}

export const load: PageServerLoad = async ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=0, s-maxage=3600, stale-while-revalidate=604800",
  });

  // One grouped scan for counts (each version rolled up to its top-level ancestor
  // via subpath), plus the registry rows for the roots. The "listable doco"
  // predicate matches search/facets so the numbers agree across the site.
  const [feed, countResult, descRows] = await Promise.all([
    getBrowseFeed(),
    db.execute(sql`
      SELECT subpath(v.kind, 0, 1)::text AS root, count(*)::int AS count
      FROM versions v
      JOIN docos d ON d.id = v.doco_id
      WHERE v.is_latest AND v.status <> 'deprecated' AND d.deleted_at IS NULL
        AND NOT (v.kind <@ ${EXAMPLE_KIND_ROOT}::ltree)
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

  // The example sandbox is a reserved taxonomy root (so no org can claim the
  // handle), but it never appears as a browsable topic.
  const roots: RootCard[] = TAXONOMY_ROOTS_LIST.filter((root) => root !== EXAMPLE_KIND_ROOT).map(
    (root) => ({
      root,
      description: descriptions.get(root) ?? null,
      count: counts.get(root) ?? 0,
    }),
  );

  return { feed, roots };
};
