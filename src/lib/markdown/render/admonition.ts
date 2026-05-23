import { h } from "hastscript";
import type { Element, ElementContent } from "hast";
import type { ListItem } from "mdast";
import type { State } from "mdast-util-to-hast";
import { admonitionTitle, type Admonition } from "$lib/markdown/docomd";
import { iconHast, type IconName } from "./icons.ts";
import { renderCards } from "./cards.ts";

// docolin's design layer for admonitions: turns a docomd `admonition` mdast node
// into the styled hast (Tailwind classes + Lucide icons) the doco viewer renders.
// This is docolin-specific (theme tokens, the locked light-only palette), so it
// lives here rather than in the design-agnostic docomd package. The markup
// matches what the markdown CSS and the .markdown-collapsible animation in
// layout.css expect.
//
// Five callout types plus three list-wrapping constructs: steps (a numbered
// vertical stepper), cards (a responsive grid), and accordion (grouped
// exclusive-open <details>).

export const BODY_RESET = ["[&>*:first-child]:mt-0", "[&>*:last-child]:mb-0"];

// First list in the body. steps/cards/accordion each wrap a markdown list; this
// pulls its items. Returns [] if the body is not a list (graceful degrade).
function bodyListItems(node: Admonition): ListItem[] {
  for (const child of node.children) {
    if (child.type === "list") return child.children;
  }
  return [];
}

// ---------- Callouts + collapsibles ----------

export interface AdmonitionConfig {
  icon: IconName;
  border: string;
  header: string;
  body: string;
  text: string;
}

// Type set + light-only palette (warning/tip use raw Tailwind status scales since
// the theme has no token for them; dark mode is a separate workstream). Shared with
// the card renderer for typed cards (`{ type=... }`).
export const CALLOUTS: Record<string, AdmonitionConfig> = {
  note: {
    icon: "pencil",
    border: "border-foreground/20",
    header: "bg-muted",
    body: "bg-muted/30",
    text: "text-foreground",
  },
  info: {
    icon: "info",
    border: "border-primary/40",
    header: "bg-primary/10",
    body: "bg-primary/5",
    text: "text-primary",
  },
  tip: {
    icon: "lightbulb",
    border: "border-emerald-500/40",
    header: "bg-emerald-100",
    body: "bg-emerald-50",
    text: "text-emerald-900",
  },
  warning: {
    icon: "triangle-alert",
    border: "border-amber-500/50",
    header: "bg-amber-100",
    body: "bg-amber-50",
    text: "text-amber-900",
  },
  danger: {
    icon: "octagon-alert",
    border: "border-destructive/40",
    header: "bg-destructive/10",
    body: "bg-destructive/5",
    text: "text-destructive",
  },
  check: {
    icon: "check",
    border: "border-emerald-500/40",
    header: "bg-emerald-100",
    body: "bg-emerald-50",
    text: "text-emerald-900",
  },
};

// Unknown types (typos) fall back to a neutral box, so mistakes stay visible.
export const NEUTRAL = CALLOUTS.note;

function renderCallout(state: State, node: Admonition): Element {
  const cfg = CALLOUTS[node.atype] ?? NEUTRAL;
  const title = admonitionTitle(node);
  const body = h("div", { class: ["px-4", "py-3", cfg.body, ...BODY_RESET] }, state.all(node));

  if (node.collapsible) {
    return h(
      "details",
      {
        ...(node.open ? { open: true } : {}),
        class: ["markdown-collapsible", "group", "my-4", "border", "border-l-4", cfg.border],
      },
      [
        h(
          "summary",
          {
            class: [
              "flex",
              "cursor-pointer",
              "list-none",
              "items-center",
              "gap-2",
              "px-4",
              "py-2",
              "text-sm",
              "font-semibold",
              cfg.header,
              cfg.text,
              "[&::-webkit-details-marker]:hidden",
            ],
          },
          [
            iconHast(cfg.icon, "size-4 shrink-0"),
            h("span", title),
            iconHast(
              "chevron-down",
              "ml-auto size-4 shrink-0 group-open:rotate-180 motion-safe:transition-transform",
            ),
          ],
        ),
        body,
      ],
    );
  }

  return h("div", { class: ["my-4", "border", "border-l-4", cfg.border] }, [
    h(
      "div",
      {
        class: [
          "flex",
          "items-center",
          "gap-2",
          "px-4",
          "py-2",
          "text-sm",
          "font-semibold",
          cfg.header,
          cfg.text,
        ],
      },
      [iconHast(cfg.icon, "size-4 shrink-0"), h("span", title)],
    ),
    body,
  ]);
}

// ---------- Steps ----------

// Numbered vertical stepper: a square badge per item joined by a connector line.
function renderSteps(state: State, node: Admonition): Element {
  const items = bodyListItems(node);
  const steps = items.map((item, index) => {
    const marker = h("div", { class: ["flex", "flex-col", "items-center"] }, [
      h(
        "span",
        {
          class: [
            "flex",
            "size-7",
            "shrink-0",
            "items-center",
            "justify-center",
            "bg-primary",
            "text-sm",
            "font-medium",
            "text-primary-foreground",
          ],
        },
        String(index + 1),
      ),
      ...(index === items.length - 1
        ? []
        : [h("span", { class: ["my-1", "w-px", "flex-1", "bg-border"] })]),
    ]);
    const content = h(
      "div",
      { class: ["min-w-0", "flex-1", "pb-6", ...BODY_RESET] },
      state.all(item),
    );
    return h("div", { class: ["flex", "gap-3"] }, [marker, content]);
  });
  const heading =
    node.title.length > 0
      ? [h("p", { class: ["mb-4", "font-semibold", "text-foreground"] }, node.title)]
      : [];
  return h("div", { class: ["my-4"] }, [...heading, ...steps]);
}

// ---------- Accordion ----------

// Per-group name so opening one row closes the others (native <details name>).
// A module counter is fine: names only need to be unique within one rendered
// page, and each render produces an independent document.
let accordionGroup = 0;

function renderAccordion(state: State, node: Admonition): Element {
  const name = `docomd-accordion-${String(accordionGroup++)}`;
  const rows = bodyListItems(node).map((item) => {
    const content = state.all(item);
    const head = content.at(0);
    const rest = content.slice(1);
    // The first block (usually a paragraph) is the clickable question; the rest
    // is the collapsible body.
    const summaryChildren: ElementContent[] =
      head === undefined ? [] : head.type === "element" ? head.children : [head];
    return h("details", { name, class: ["markdown-collapsible", "group"] }, [
      h(
        "summary",
        {
          class: [
            "flex",
            "cursor-pointer",
            "list-none",
            "items-center",
            "gap-2",
            "px-4",
            "py-3",
            "font-medium",
            "[&::-webkit-details-marker]:hidden",
          ],
        },
        [
          h("span", { class: ["min-w-0", "flex-1"] }, summaryChildren),
          iconHast(
            "chevron-down",
            "size-4 shrink-0 group-open:rotate-180 motion-safe:transition-transform",
          ),
        ],
      ),
      h("div", { class: ["px-4", "pb-3", ...BODY_RESET] }, rest),
    ]);
  });
  return h("div", { class: ["divide-border", "my-4", "divide-y", "border"] }, rows);
}

// ---------- Entry ----------

/** remark-rehype handler: an `admonition` mdast node to styled hast. */
export function admonitionHandler(state: State, node: Admonition): Element {
  if (node.atype === "steps") return renderSteps(state, node);
  if (node.atype === "cards") return renderCards(state, node);
  if (node.atype === "accordion") return renderAccordion(state, node);
  return renderCallout(state, node);
}
