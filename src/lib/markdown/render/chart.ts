import { h } from "hastscript";
import type { Element, ElementContent } from "hast";
import type { State } from "mdast-util-to-hast";
import type { DocoChart } from "$lib/markdown/docomd";
import { iconHast } from "./icons.ts";

// Renders a docomd chart node (a table promoted by `{ .chart }`) to its HTML: a
// <figure> holding the chart spec in data-* attributes, a copy button, an empty
// canvas the client mounts the LayerChart into (its reserved height prevents layout
// shift), and the source table kept for the fallback paths (no-JS / SEO / a11y / AI)
// but hidden once the chart mounts. The parsing side lives in docomd/chart.ts; this
// is the docolin-specific rendering (Tailwind classes + Lucide icons).

const FIGCAPTION_CLASS = ["doco-chart-title", "mb-2", "text-sm", "font-medium", "text-foreground"];
const CANVAS_CLASS = ["doco-chart-canvas", "aspect-video", "w-full"];

// Floating "copy table as Markdown" button, mirroring the code-block copy control.
// Wired by src/lib/markdown/charts.ts, which reads the source table and rebuilds the
// Markdown. The check icon is hidden until the figure gets `data-copied` (layout.css).
function copyButton(): Element {
  return h(
    "button",
    {
      type: "button",
      class: [
        "chart-copy",
        "absolute",
        "right-2",
        "top-2",
        "z-10",
        "inline-flex",
        "items-center",
        "justify-center",
        "border",
        "border-border",
        "bg-background",
        "p-1.5",
        "text-muted-foreground",
        "transition-colors",
        "hover:text-foreground",
      ],
      "data-chart-copy": "",
      "aria-label": "Copy table as Markdown",
      title: "Copy table as Markdown",
    },
    [
      iconHast("copy", "chart-copy-icon size-4"),
      iconHast("check", "chart-check-icon size-4 text-emerald-600 dark:text-emerald-400"),
    ],
  );
}

/** remark-rehype handler for {@link DocoChart}. */
export function chartHandler(state: State, node: DocoChart): Element {
  const { spec } = node;
  const props: Record<string, string> = { "data-doco-chart": spec.type };
  if (spec.stacked) props["data-stacked"] = "";
  if (spec.legend) props["data-legend"] = "";
  if (spec.horizontal) props["data-horizontal"] = "";

  const children: ElementContent[] = [copyButton()];
  if (spec.title !== null) children.push(h("figcaption", { class: FIGCAPTION_CLASS }, spec.title));
  children.push(h("div", { class: CANVAS_CLASS }));

  const converted = state.all(node as unknown as Parameters<typeof state.all>[0]);
  for (const child of converted) {
    if (child.type === "element" && child.tagName === "table") {
      const cls = child.properties.className;
      child.properties.className = Array.isArray(cls) ? [...cls, "sr-only"] : ["sr-only"];
    }
  }
  children.push(...converted);

  return h(
    "figure",
    { class: ["doco-chart", "not-prose", "relative", "my-6"], ...props },
    children,
  );
}
