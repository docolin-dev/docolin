import type { CustomFont } from "@cf-wasm/og/workerd";

// Geist static TTFs live in `static/fonts/` and ship as Workers Static Assets
// (they do NOT count against the worker's size budget). Satori reads TTF
// natively; it cannot read the woff2 variable font the app uses at runtime,
// which is why the card carries its own static weights.
//
// We fetch through SvelteKit's `event.fetch`: for a same-origin static asset it
// resolves against the assets layer without a real network round-trip, and it
// works identically in `vite dev` and on the deployed Worker.

/** The weights the card template draws with. */
const WEIGHTS = [400, 500, 600] as const;
type Weight = (typeof WEIGHTS)[number];

// One fetch per weight per isolate: the first render of any card warms this,
// later renders in the same isolate reuse the bytes. (Each rendered PNG is also
// edge-cached, so a given card only renders once anyway.)
const buffers = new Map<Weight, Promise<ArrayBuffer>>();

function loadWeight(fetchFn: typeof fetch, weight: Weight): Promise<ArrayBuffer> {
  const existing = buffers.get(weight);
  if (existing !== undefined) return existing;
  const promise = fetchFn(`/fonts/geist-${String(weight)}.ttf`).then((res) => {
    if (!res.ok) throw new Error(`OG font geist-${String(weight)} failed: ${String(res.status)}`);
    return res.arrayBuffer();
  });
  buffers.set(weight, promise);
  return promise;
}

/** The three Geist weights as Satori fonts, all under the family "Geist" so the
 *  template can switch weight with `fontWeight`. The `CustomFont` class is
 *  passed in because it comes from whichever @cf-wasm/og entry the current
 *  runtime loaded (Node in dev, workerd in prod). Loaders are lazy: Satori
 *  calls them during render, and they hit the per-isolate cache above. */
export function ogFonts(CustomFontClass: typeof CustomFont, fetchFn: typeof fetch): CustomFont[] {
  return WEIGHTS.map(
    (weight) => new CustomFontClass("Geist", () => loadWeight(fetchFn, weight), { weight }),
  );
}
