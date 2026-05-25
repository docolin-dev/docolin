import { env } from "$lib/server/env";

// Cloudflare cache purge for doco latest URLs. After a sync publishes new
// versions, we tell CF to drop the cached HTML for every affected URL so the
// next reader hits a fresh function invocation. Versioned URLs (`...@{sha}`)
// are immutable and never purged.
//
// Setup: a CF API token scoped to `Zone.Cache Purge` on the zone serving
// docolin.com. Token + zone id come from env; both unset means we no-op with
// a warning so local dev / tests don't fail because of CF config.
//
// API: POST https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache
// with `{ files: [...] }`. Max 30 URLs per call, so chunk if needed. Failures
// are logged but don't throw: a missed purge degrades to "edge serves stale
// for up to s-maxage", which the doco viewer's stale-while-revalidate window
// recovers from; throwing here would crash the sync handler after the DB has
// already committed.

// CF API caps each purge_cache call at 30 URLs.
const PURGE_CHUNK_SIZE = 30;

export async function purgeCacheUrls(urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const purgeToken = env.CLOUDFLARE_CACHE_PURGE_TOKEN;
  if (!zoneId || !purgeToken) {
    console.warn(
      `Cache purge skipped: CLOUDFLARE_ZONE_ID / CLOUDFLARE_CACHE_PURGE_TOKEN unset. ${urls.length.toString()} URL(s) would have been purged.`,
    );
    return;
  }

  for (let i = 0; i < urls.length; i += PURGE_CHUNK_SIZE) {
    const chunk = urls.slice(i, i + PURGE_CHUNK_SIZE);
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${purgeToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ files: chunk }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(
          `Cache purge failed (status ${res.status.toString()}): ${body.slice(0, 500)}`,
        );
      }
    } catch (err) {
      console.error("Cache purge request threw", err);
    }
  }
}
