import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { kinds } from "$lib/server/db/schema";
import { toLtree } from "$lib/server/db/schema/types";
import type { SearchResponse } from "$lib/components/search/types";

// Kind browse page (the "soft link" target). A taxonomy path like /tools/docolin
// renders every doco under that kind, ranked by quality + recency by default and
// re-ranked by the reader's local setup after hydration. Unlike /search this is a
// public, indexable landing page, so the default-ranked results are server-
// rendered (reader-independent, cacheable, crawlable).

const SSR_LIMIT = 20;

export const load: PageServerLoad = async ({ params, fetch, setHeaders, isDataRequest }) => {
  const kindDisplay = params.rest.length > 0 ? `${params.root}/${params.rest}` : params.root;
  const kindLtree = toLtree(kindDisplay);

  // Reader-independent (setup is applied client-side), so edge-cacheable. Short
  // edge TTL since the listing changes as docos sync; no purge wired yet.
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
  });

  // Default-ranked results plus the kind-subtree counts that drive the folder nav.
  const query = new URLSearchParams({
    kind: kindDisplay,
    facets: "1",
    limit: String(SSR_LIMIT),
    mode: "hybrid",
  });
  const res = await fetch(`/api/search?${query.toString()}`);
  const data = res.ok ? ((await res.json()) as SearchResponse) : null;

  // Registry metadata for the heading and meta description; absent for a kind
  // that has no registry row yet (the page falls back to the path segment).
  const registry = (
    await db
      .select({ displayPath: kinds.displayPath, description: kinds.description })
      .from(kinds)
      .where(eq(kinds.path, kindLtree))
      .limit(1)
  ).at(0);

  return {
    kindDisplay,
    kindLtree,
    segments: kindDisplay.split("/"),
    registryDescription: registry?.description ?? null,
    results: data?.results ?? [],
    facets: data?.facets ?? null,
    total: data?.total ?? 0,
  };
};
