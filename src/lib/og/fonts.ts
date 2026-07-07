import type { CustomFont } from "@cf-wasm/og/workerd";

// Geist static TTFs live in `static/fonts/` and ship as Workers Static Assets
// (they do NOT count against the worker's size budget). Satori reads TTF
// natively; it cannot read the woff2 variable font the app uses at runtime,
// which is why the card carries its own static weights.
//
// Loading them is subtle: static assets are served by the assets layer in
// FRONT of the Worker, so `event.fetch('/fonts/..')` from inside the Worker
// never reaches them (it falls through to the app router and returns 404 HTML,
// which Satori then rejects). The caller passes an `AssetFetch` that reads the
// asset correctly for the current runtime: the `ASSETS` binding in production,
// a plain origin fetch in `vite dev`. See endpoint.ts.

/** Reads a static asset by root-relative path (e.g. "/fonts/geist-400.ttf"). */
export type AssetFetch = (path: string) => Promise<Response>;

/** The weights the card template draws with. */
const WEIGHTS = [400, 500, 600] as const;
type Weight = (typeof WEIGHTS)[number];

// One fetch per weight per isolate: the first render of any card warms this,
// later renders in the same isolate reuse the bytes. (Each rendered PNG is also
// edge-cached, so a given card only renders once anyway.) Only the FIRST call's
// `fetchFn` does the work; once a weight is cached the argument is ignored,
// which is fine since the static asset is identical across every request.
const buffers = new Map<Weight, Promise<ArrayBuffer>>();

function loadWeight(assetFetch: AssetFetch, weight: Weight): Promise<ArrayBuffer> {
  const existing = buffers.get(weight);
  if (existing !== undefined) return existing;
  const promise = assetFetch(`/fonts/geist-${String(weight)}.ttf`)
    .then((res) => {
      if (!res.ok) throw new Error(`OG font geist-${String(weight)} failed: ${String(res.status)}`);
      return res.arrayBuffer();
    })
    .catch((err: unknown) => {
      // Evict the rejected promise so a transient failure doesn't poison the
      // cache for the isolate's whole life (every later render would reuse the
      // rejection and silently fall back to the default card). The next request
      // retries the fetch.
      buffers.delete(weight);
      throw err;
    });
  buffers.set(weight, promise);
  return promise;
}

/** The three Geist weights as Satori fonts, all under the family "Geist" so the
 *  template can switch weight with `fontWeight`. The `CustomFont` class is
 *  passed in because it comes from whichever @cf-wasm/og entry the current
 *  runtime loaded (Node in dev, workerd in prod). Loaders are lazy: Satori
 *  calls them during render, and they hit the per-isolate cache above. */
export function ogFonts(CustomFontClass: typeof CustomFont, assetFetch: AssetFetch): CustomFont[] {
  return WEIGHTS.map(
    (weight) => new CustomFontClass("Geist", () => loadWeight(assetFetch, weight), { weight }),
  );
}
