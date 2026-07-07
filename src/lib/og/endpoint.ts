import { dev } from "$app/environment";
import type { RequestEvent } from "@sveltejs/kit";
import { renderOgCard } from "./render";
import type { AssetFetch } from "./fonts";
import type { CardSpec } from "./types";

/** The branded static card served when a resource has no data-driven card (a
 *  missing resource, or a render failure). It lives in `static/og/`. */
export const DEFAULT_OG_CARD = "/og/default.png";

/** An asset reader for the current runtime. Static assets sit in front of the
 *  Worker, so the deployed app must read them through the `ASSETS` binding; a
 *  plain fetch to their path would fall through to the app router and 404.
 *  `vite dev` has no binding, so there we fetch the dev server's own origin. */
function assetFetcher(event: RequestEvent): AssetFetch {
  const assets = event.platform?.env.ASSETS;
  const origin = event.url.origin;
  // In production (and `wrangler dev`) read through the binding. In `vite dev`
  // there's no real binding (getPlatformProxy may expose a non-serving stub),
  // so fetch the dev server's own origin, which serves static/ directly.
  if (!dev && assets !== undefined) {
    // The ASSETS binding returns @cloudflare/workers-types' Response; we only
    // read `.ok` and `.arrayBuffer()`, which the global Response also has.
    return (path) => assets.fetch(new URL(path, origin)) as unknown as Promise<Response>;
  }
  return (path) => fetch(new URL(path, origin));
}

/** Turn a resolved spec into a PNG response, or redirect to the default card
 *  when there's nothing to draw. Rendering is wrapped so a Satori/WASM failure
 *  degrades to the branded default instead of a 500 with no preview at all
 *  (an OG endpoint that errors leaves the link bare in every feed). */
export async function ogImageResponse(
  event: RequestEvent,
  spec: CardSpec | null,
  cacheControl?: string,
): Promise<Response> {
  if (spec === null) {
    return new Response(null, { status: 302, headers: { location: DEFAULT_OG_CARD } });
  }
  try {
    return await renderOgCard(spec, {
      assetFetch: assetFetcher(event),
      ctx: event.platform?.context,
      cacheControl,
    });
  } catch (err) {
    // Satori and the resvg WASM can throw on inputs we can't fully predict
    // (an exotic glyph, a font-load hiccup). Full detail to the Worker log,
    // branded default to the crawler.
    console.error("OG render failed", err);
    return new Response(null, { status: 302, headers: { location: DEFAULT_OG_CARD } });
  }
}
