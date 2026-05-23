import { h } from "hastscript";
import type { Element, ElementContent } from "hast";
import type { State } from "mdast-util-to-hast";
import type { DocoTabbedSet } from "$lib/markdown/docomd";

// docolin's design layer for content tabs. A `docoTabbedSet` becomes a native
// radio group: each hidden radio sits directly before its panel, so a single CSS
// rule (`.tabbed-radio:checked + .tabbed-block`) switches panels for ANY number of
// tabs, with no JS and no flash (the first radio is checked server-side, so the
// right panel paints on the first frame and keeps working after a client-side
// navigation). The labels come first (visual top); the active-underline + focus
// ring are mapped per index with `:has` and capped (cosmetic only, the panels are
// uncapped). The client enhancement layers cross-set sync + persistence on top;
// keyboard switching is the browser's native radio-group behaviour.

const BODY_RESET = ["[&>*:first-child]:mt-0", "[&>*:last-child]:mb-0"];

// Per-render counter for unique radio group names + ids (mirrors the accordion
// handler). Each rendered document is independent.
let tabSet = 0;

// Only layout utilities; label color + active underline are owned in layout.css so
// they are not beaten by a utility (utilities win over @layer base).
const LABEL_CLASS = ["tabbed-tab", "-mb-px", "px-3", "py-2", "text-sm", "font-medium"];

/** remark-rehype handler: a content-tab set to a radio-driven tablist + panels. */
export function tabbedSetHandler(state: State, node: DocoTabbedSet): Element {
  const setId = `docomd-tabs-${String(tabSet++)}`;
  const name = `${setId}-radio`;
  const tabs = node.children;

  const labels: ElementContent[] = tabs.map((tab, index) =>
    h(
      "label",
      {
        class: LABEL_CLASS,
        htmlFor: `${setId}-radio-${String(index)}`,
        "data-tab-label": tab.label,
      },
      tab.label,
    ),
  );

  // Interleave each radio with its panel so `:checked + .tabbed-block` shows it.
  const interleaved: ElementContent[] = [];
  tabs.forEach((tab, index) => {
    interleaved.push(
      h("input", {
        type: "radio",
        class: ["tabbed-radio"],
        name,
        id: `${setId}-radio-${String(index)}`,
        "data-tab-label": tab.label,
        ...(index === 0 ? { checked: true } : {}),
      }),
      h("div", { class: ["tabbed-block", ...BODY_RESET] }, state.all(tab)),
    );
  });

  return h("div", { class: ["tabbed-set", "my-4"] }, [
    h(
      "div",
      { class: ["tabbed-labels", "flex", "flex-wrap", "gap-1", "border-b", "border-border"] },
      labels,
    ),
    ...interleaved,
  ]);
}
