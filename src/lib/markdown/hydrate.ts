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
import { setupInlineCopy, enhanceSwatches } from "./inline-copy";
import { setupYoutube } from "./youtube";
import { setupDiffs, renderDiffs } from "./diff";

/** Re-runs every per-render enhancement (diagrams, charts, color swatches, diff
 *  viewers, and the saved tab choice) over the current DOM. Call it whenever new
 *  rendered markdown lands: the root layout does on each navigation, and the
 *  local-folder preview after each client-side render. One entry point so a new
 *  enhancement added here reaches every surface at once. */
export function enhanceRenderedMarkdown(): void {
  applyTabPreference();
  renderMermaid();
  renderCharts();
  enhanceSwatches();
  renderDiffs();
}

/** Wires every client-side markdown widget once, returning a single teardown. */
export function setupMarkdownHydration(): () => void {
  const teardowns = [
    setupCodeCopy(),
    setupCodeLineSelect(),
    setupContentTabs(),
    setupMermaid(),
    setupCharts(),
    setupMarkdownPopovers(),
    setupInlineCopy(),
    setupYoutube(),
    setupDiffs(),
  ];
  return () => {
    for (const teardown of teardowns) teardown();
  };
}
