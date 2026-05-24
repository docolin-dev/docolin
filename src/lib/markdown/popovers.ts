// Client-only: wires the shared hovercard engine to the markdown popover features
// (footnote previews for now; code annotations and link previews join here). Each is
// just a content resolver over server-rendered HTML, so the read path stays static.
import { setupHovercards, type HovercardSource } from "./hovercard.ts";
import { renderMermaid } from "./mermaid.ts";
import { mountChartsIn } from "./charts.ts";

// Hydrate dynamic widgets in a cloned popover. Code-block copy/select buttons already
// work through the page's delegated listeners, and math/callouts/steps are static, so
// only diagrams, charts, and tab groups need attention here.
let tabCloneSeq = 0;
function rehydrate(card: HTMLElement): void {
  // Cloned tab groups share radio names + label/input ids with the originals; give
  // them unique ids so they switch independently.
  if (card.querySelector(".tabbed-set") !== null) {
    const suffix = `-pop${String(tabCloneSeq)}`;
    tabCloneSeq += 1;
    for (const radio of card.querySelectorAll<HTMLInputElement>(".tabbed-radio")) {
      const oldId = radio.id;
      radio.name += suffix;
      radio.id = oldId + suffix;
      const label = card.querySelector<HTMLLabelElement>(`label[for="${oldId}"]`);
      if (label !== null) label.htmlFor = radio.id;
    }
  }
  if (card.querySelector(".mermaid") !== null) renderMermaid();
  if (card.querySelector(".doco-chart") !== null) mountChartsIn(card);
}

// A footnote reference (`[^1]`) links to its definition `<li>` in the bottom section
// (remark-gfm markup). The preview shows that definition inline, minus the "back to
// reference" arrow. The bottom section stays as the no-JS / print / permalink path.
function footnoteContent(reference: HTMLElement): Node | null {
  const href = reference.getAttribute("href");
  if (!href?.startsWith("#")) return null;
  const definition = document.getElementById(href.slice(1));
  if (definition === null) return null;
  const clone = definition.cloneNode(true) as HTMLElement;
  for (const backref of clone.querySelectorAll("[data-footnote-backref]")) backref.remove();
  const body = document.createElement("div");
  body.className = "doco-hovercard-body";
  body.append(...clone.childNodes);
  return body;
}

const footnoteSource: HovercardSource = {
  selector: "[data-footnote-ref]",
  trigger: "hover",
  resolve: footnoteContent,
  onShown: rehydrate,
};

// A code annotation button points (via data-annotation-ref) at its <li> in the
// annotation list below the block. Click-triggered so touch users can reach it (the
// list stays visible as the fallback). Shows the list item's content.
function annotationContent(button: HTMLElement): Node | null {
  const id = button.dataset.annotationRef;
  if (id === undefined) return null;
  const item = document.getElementById(id);
  if (item === null) return null;
  const body = document.createElement("div");
  body.className = "doco-hovercard-body";
  body.append(...item.cloneNode(true).childNodes);
  return body;
}

const annotationSource: HovercardSource = {
  selector: "[data-annotation-ref]",
  trigger: "click",
  placement: "bottom-start", // opens to the bottom-right of the badge
  resolve: annotationContent,
  onShown: rehydrate,
};

// An internal doco link (/org/project/path) previews the target's title +
// description, fetched from the cacheable preview endpoint and memoized per path.
interface DocoPreview {
  title: string;
  description: string | null;
  kind: string;
}
const previewCache = new Map<string, DocoPreview | null>();

async function fetchPreview(path: string): Promise<DocoPreview | null> {
  if (previewCache.has(path)) return previewCache.get(path) ?? null;
  const response = await fetch(`/api/doco-preview?url=${encodeURIComponent(path)}`, {
    credentials: "same-origin",
  });
  const preview = response.ok ? ((await response.json()) as DocoPreview) : null;
  previewCache.set(path, preview);
  return preview;
}

async function linkPreview(link: HTMLElement): Promise<Node | null> {
  const href = link.getAttribute("href");
  if (!href?.startsWith("/")) return null;
  const path = href.split("#")[0].split("?")[0];
  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 3) return null; // not an org/project/path doco link
  const preview = await fetchPreview(`/${segments.join("/")}`);
  if (preview === null) return null;

  const body = document.createElement("div");
  body.className = "doco-hovercard-body doco-link-preview";
  const title = document.createElement("div");
  title.className = "doco-link-preview-title";
  title.textContent = preview.title;
  body.append(title);
  if (preview.description !== null && preview.description.length > 0) {
    const description = document.createElement("p");
    description.textContent = preview.description;
    body.append(description);
  }
  return body;
}

const linkSource: HovercardSource = {
  // Plain internal doco links only: skip card links and CTA buttons, which already
  // state where they go.
  selector: ".prose a[href^='/']:not(.card-link):not(.doco-button)",
  trigger: "hover",
  resolve: linkPreview,
};

/** Wires every markdown popover. Returns a teardown for the layout's onMount. */
export function setupMarkdownPopovers(): () => void {
  return setupHovercards([footnoteSource, annotationSource, linkSource]);
}
