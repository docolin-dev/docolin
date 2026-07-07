import { dev } from "$app/environment";
import { buildCard, OG_WIDTH, OG_HEIGHT } from "./card";
import { ogFonts } from "./fonts";
import type { CardSpec } from "./types";

/** Long edge cache for cards that can change (a topic's doco count, a profile's
 *  stats): served from cache, refreshed by the sync/write purge. Doco cards can
 *  pass a longer value since their content is versioned. */
export const OG_CACHE_MUTABLE = "public, max-age=3600, s-maxage=2592000";

// @cf-wasm/og ships one entry per runtime because each loads the Satori/resvg
// WASM differently. `vite dev` runs SSR in Node, the deployed app runs in
// workerd, and the workerd entry's WASM import throws under Node (the "wbg"
// resolution error). `dev` is statically known at build time, so each build
// tree-shakes to a single branch: the Node entry in dev, the workerd entry
// (the package's official Cloudflare Workers target) in production. The entries
// re-export the same core API, so the cast is a formality.
type OgRuntime = typeof import("@cf-wasm/og/workerd");
function loadOgRuntime(): Promise<OgRuntime> {
  return dev ? import("@cf-wasm/og/node") : import("@cf-wasm/og/workerd");
}

interface RenderOptions {
  /** SvelteKit's `event.fetch`, used to load the fonts from static assets. */
  fetch: typeof fetch;
  /** The Worker execution context (`event.platform.context`), which @cf-wasm/og
   *  uses to cache compiled WASM across requests. Optional so `vite dev` (no
   *  platform) still renders. */
  ctx?: { waitUntil(promise: Promise<unknown>): void };
  /** Overrides the default `Cache-Control`. */
  cacheControl?: string;
}

/** Render a resolved {@link CardSpec} to a PNG {@link Response}. Never fetches
 *  external images (the card is pure text + fills), so it sidesteps Satori's
 *  image-on-Workers pitfalls entirely. */
export async function renderOgCard(spec: CardSpec, options: RenderOptions): Promise<Response> {
  const { ImageResponse, CustomFont, cache } = await loadOgRuntime();
  if (options.ctx !== undefined) cache.setExecutionContext(options.ctx);

  const image = await ImageResponse.async(
    // buildCard returns a Satori VNode (plain object), which is exactly one of
    // the shapes ImageResponse accepts, so no React is involved.
    buildCard(spec),
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: ogFonts(CustomFont, options.fetch),
    },
  );

  const headers = new Headers(image.headers);
  headers.set("content-type", "image/png");
  headers.set("cache-control", options.cacheControl ?? OG_CACHE_MUTABLE);
  return new Response(image.body, { status: image.status, headers });
}
