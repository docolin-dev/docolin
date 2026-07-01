import { h } from "hastscript";
import type { Element, ElementContent } from "hast";
import type { Code } from "mdast";
import type { State } from "mdast-util-to-hast";
import type { Admonition } from "$lib/markdown/docomd";

// A `!!! diff` body holds two code blocks: the before and after source. We render
// them (shiki-highlighted) into `.doco-diff-source` as both the graceful fallback
// (no-JS / AI ingest see two labeled code blocks) and the client's source of truth,
// plus an empty `.doco-diff-canvas` the client (src/lib/markdown/diff.ts) mounts the
// interactive diff viewer into on first reveal. If the body is not two code blocks,
// the source shows as-is and the client leaves it untouched (graceful degrade).

// The fallback mirrors the mounted viewer's framing: the figure is the bordered
// panel (border via CSS only while unmounted), the figcaption reads like the
// viewer's header bar, and each source block gets a small Before/After label.
const TITLE_CLASS = [
  "doco-diff-title",
  "flex",
  "items-center",
  "border-b",
  "border-border",
  "bg-muted",
  "px-3",
  "py-1.5",
  "text-xs",
  "font-medium",
  "text-foreground",
];

const SIDE_LABEL_CLASS = [
  "text-muted-foreground",
  "mb-1",
  "block",
  "font-mono",
  "text-[0.7rem]",
  "uppercase",
];

/** remark-rehype handler logic for a `!!! diff` admonition. */
export function renderDiff(state: State, node: Admonition): Element {
  const firstCode = node.children.find((c): c is Code => c.type === "code");
  const lang = firstCode?.lang ?? "text";

  // The title rides on the figure so the mounted viewer can show it in its own
  // header bar (one bar, not two). The figcaption stays for the no-JS fallback and
  // is hidden by CSS once the viewer mounts.
  const props: Record<string, string> = { "data-doco-diff": "", "data-diff-lang": lang };
  const children: ElementContent[] = [];
  if (node.title.length > 0) {
    props["data-diff-title"] = node.title;
    children.push(h("figcaption", { class: TITLE_CLASS }, node.title));
  }
  // A proper before/after pair gets its sides labeled; anything else (graceful
  // degrade for a malformed body) shows as-is.
  const rendered = state.all(node);
  const sources =
    rendered.length === 2
      ? rendered.map((child, index) =>
          h("div", { class: ["doco-diff-side"] }, [
            h("span", { class: SIDE_LABEL_CLASS }, index === 0 ? "Before" : "After"),
            child,
          ]),
        )
      : rendered;
  // Reserved mount slot (client fills it) + the source blocks as the fallback.
  children.push(h("div", { class: ["doco-diff-canvas"] }));
  children.push(h("div", { class: ["doco-diff-source", "grid", "gap-4", "p-3"] }, sources));

  return h("figure", { class: ["doco-diff", "not-prose", "relative", "my-6"], ...props }, children);
}
