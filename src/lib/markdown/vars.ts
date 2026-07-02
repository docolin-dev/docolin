// Client-only: interactive variables. This entry stays feather-light on every
// page: it only checks whether the page has an inputs card, and lazy-loads the
// implementation (jsep + the evaluator + the Svelte card) exclusively on pages
// that do. Same claim/teardown shape as diff.ts / charts.ts.

type Impl = typeof import("./vars-impl.ts");

let impl: Impl | null = null;
let generation = 0;

/** Scans the page for inputs cards and, when present, hands the page to the
 *  lazily-loaded implementation. Call on load and after each navigation (and
 *  after each preview re-render). */
export function renderVars(): void {
  const cards = document.querySelectorAll<HTMLElement>("[data-doco-inputs]");
  const current = ++generation;
  impl?.teardownPage();
  if (cards.length === 0) return;
  void import("./vars-impl.ts").then((mod) => {
    // A navigation may have raced the import; only the newest scan mounts.
    if (current !== generation) return;
    impl = mod;
    mod.mountPage();
  });
}

/** Wires interactive variables; the returned teardown unmounts everything. */
export function setupVars(): () => void {
  renderVars();
  return () => {
    generation++;
    impl?.teardownPage();
  };
}
