import type { RequestEvent } from "@sveltejs/kit";
import { renderOgCard } from "./render";
import type { CardSpec } from "./types";

/** The branded static card served when a resource has no data-driven card (a
 *  missing resource, or a render failure). It lives in `static/og/`. */
export const DEFAULT_OG_CARD = "/og/default.png";

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
      fetch: event.fetch,
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
