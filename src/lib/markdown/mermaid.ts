// Client-only: render ```mermaid blocks to SVG. Mermaid needs a browser, so it is
// lazy-imported the first time a diagram becomes visible, never shipped to readers
// who have no diagrams. The source is server-rendered into the element (a no-JS /
// SEO fallback); we cache it on first render so the diagram can be re-rendered when
// the theme changes (Mermaid bakes the theme into the SVG).
//
// Diagrams are rendered on first reveal, not all at once on load: a diagram inside
// an inactive tab or a closed <details> has a zero-width box (display: none), and
// Mermaid would measure that and draw a broken SVG it never recovers from. An
// IntersectionObserver draws each diagram the moment it is actually shown (tab
// switch, accordion open, or scroll), with the theme current at that moment.

// Inferred from the dynamic import so we don't hand-maintain Mermaid's types.
let api: Awaited<typeof import("mermaid")>["default"] | null = null;
let observer: IntersectionObserver | null = null;
// Original source per element, captured before Mermaid replaces it with an SVG.
const sources = new WeakMap<HTMLElement, string>();
// The theme (dark?) each element was last drawn with, so we skip redundant redraws
// and know which visible diagrams a theme switch must repaint.
const renderedDark = new WeakMap<HTMLElement, boolean>();
// Currently-intersecting diagrams, tracked by the observer so a theme switch can
// repaint exactly the visible ones (hidden ones repaint when next revealed).
const visible = new Set<HTMLElement>();

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

async function renderNodes(nodes: HTMLElement[]): Promise<void> {
  if (nodes.length === 0) return;
  const dark = isDark();
  api ??= (await import("mermaid")).default;
  // Restore the cached source and clear Mermaid's processed marker, so a redraw
  // (e.g. after a theme switch) starts from scratch instead of keeping the SVG.
  for (const node of nodes) {
    if (!sources.has(node)) sources.set(node, node.textContent);
    node.textContent = sources.get(node) ?? "";
    node.removeAttribute("data-processed");
  }
  api.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
  });
  try {
    await api.run({ nodes });
  } catch {
    // A malformed diagram throws; Mermaid leaves an inline error in the element.
    // Don't let one bad diagram break the rest of the page.
  }
  for (const node of nodes) renderedDark.set(node, dark);
}

function makeObserver(): IntersectionObserver {
  return new IntersectionObserver((entries) => {
    const dark = isDark();
    const shown: HTMLElement[] = [];
    for (const entry of entries) {
      const node = entry.target as HTMLElement;
      if (entry.isIntersecting) {
        visible.add(node);
        // Draw on first reveal, or when revealed under a theme it wasn't drawn for.
        if (renderedDark.get(node) !== dark) shown.push(node);
      } else {
        visible.delete(node);
      }
    }
    void renderNodes(shown);
  });
}

/** Observe every diagram on the page so each renders when first revealed. Call on
 *  initial load and after each client navigation (new pages bring new diagrams; old
 *  ones are gone, so we rebuild the observer rather than accumulate stale nodes). */
export function renderMermaid(): void {
  observer?.disconnect();
  visible.clear();
  observer = makeObserver();
  for (const node of document.querySelectorAll<HTMLElement>(".mermaid")) observer.observe(node);
}

/** Wires Mermaid: observe diagrams for reveal, plus repaint on a light/dark flip. */
export function setupMermaid(): () => void {
  renderMermaid();
  // mode-watcher toggles `.dark` on <html>; repaint the visible diagrams so their
  // baked-in theme matches (hidden ones repaint when next revealed).
  const themeObserver = new MutationObserver(() => {
    if (api === null) return;
    const dark = isDark();
    void renderNodes([...visible].filter((node) => renderedDark.get(node) !== dark));
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => {
    observer?.disconnect();
    observer = null;
    visible.clear();
    themeObserver.disconnect();
  };
}
