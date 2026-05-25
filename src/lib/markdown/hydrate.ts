// Client-only markdown hydration entry. Imported lazily and behind `browser` by
// the root layout, so its browser-only dependencies, Mermaid (+ cytoscape) and
// LayerChart (+ d3), never enter the SSR/worker bundle. Everything wired here
// touches the DOM and only runs after hydration.
import { setupCodeCopy } from "./copy-code";
import { setupCodeLineSelect } from "./code-lines";
import { setupContentTabs, applyTabPreference } from "./content-tabs";
import { setupMermaid, renderMermaid } from "./mermaid";
import { setupCharts, renderCharts } from "./charts";
import { setupMarkdownPopovers } from "./popovers";

// Re-exported for the layout's afterNavigate (re-render diagrams/charts and
// restore the tab choice on each client navigation) and the initial render.
export { applyTabPreference, renderMermaid, renderCharts };

/** Wires every client-side markdown widget once, returning a single teardown. */
export function setupMarkdownHydration(): () => void {
  const teardowns = [
    setupCodeCopy(),
    setupCodeLineSelect(),
    setupContentTabs(),
    setupMermaid(),
    setupCharts(),
    setupMarkdownPopovers(),
  ];
  return () => {
    for (const teardown of teardowns) teardown();
  };
}
