import { h } from "hastscript";
import type { Element, ElementContent } from "hast";
import type { ListItem, Paragraph } from "mdast";
import type { State } from "mdast-util-to-hast";
import { parseAttrs, type Admonition } from "$lib/markdown/docomd";
import { iconHast, lucideIconHast } from "./icons.ts";
import { BODY_RESET, CALLOUTS, type AdmonitionConfig } from "./admonition.ts";

// docolin's design layer for cards: a list inside `!!! cards` becomes a responsive
// grid, one card per item. A card leads with an optional title (a link makes the
// whole card clickable, bold text makes a static title) plus an attr-list of
// options, and the rest is the description:
//
//   !!! cards { cols=2 }
//       - [Title](/url){ icon=rocket type=tip cta="Read more" arrow }
//         Description text.
//
// This mirrors Mintlify's <Card> feature set (icon, type, href, horizontal, img,
// cta, arrow) using markdown-native attr-lists, no JSX. Icons are any Lucide name,
// server-rendered to inline SVG.

const COLS_CLASSES: Record<number, string[]> = {
  1: ["grid-cols-1"],
  2: ["grid-cols-1", "sm:grid-cols-2"],
  3: ["grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3"],
  4: ["grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-4"],
};
// Default: as many ~15rem columns as fit, so authors rarely need `cols`.
const COLS_AUTO = ["grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]"];

function parseCols(attrs: string): number | null {
  for (const token of attrs.split(" ")) {
    if (token.startsWith("cols=")) {
      const value = Number(token.slice("cols=".length));
      if (Number.isInteger(value) && value >= 1 && value <= 4) return value;
    }
  }
  return null;
}

// First list in the body; cards wrap its items. [] if the body is not a list.
function bodyListItems(node: Admonition): ListItem[] {
  for (const child of node.children) {
    if (child.type === "list") return child.children;
  }
  return [];
}

// A known type word maps to a callout theme; anything else is an untyped card.
function cardTheme(type: string | undefined): AdmonitionConfig | undefined {
  if (type === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(CALLOUTS, type) ? CALLOUTS[type] : undefined;
}

function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

// The call-to-action row: an optional custom label and an arrow (shown when
// `{ arrow }` is set, or by default for external links, matching Mintlify).
function buildCta(props: Record<string, string | undefined>, href: string | null): Element | null {
  const label = props.cta !== undefined && props.cta !== "true" ? props.cta : null;
  const showArrow = props.arrow === "true" || (href !== null && isExternal(href));
  if (label === null && !showArrow) return null;
  const children: ElementContent[] = [];
  if (label !== null) children.push(h("span", label));
  if (showArrow) {
    children.push(
      iconHast(
        "arrow-right",
        "size-4 group-hover:translate-x-0.5 motion-safe:transition-transform",
      ),
    );
  }
  return h(
    "span",
    {
      class: [
        "mt-3",
        "inline-flex",
        "items-center",
        "gap-1",
        "text-sm",
        "font-medium",
        "text-primary",
      ],
    },
    children,
  );
}

// Reads the `{ ... }` option list that follows the title (index 0), and removes
// the nodes it consumes, leaving the description. gfm autolinks a bare URL inside
// the list (img=https://...) into a separate link node, splitting the text; we
// reconstruct the original string by stitching text values and link urls back
// together up to the closing brace. Returns {} if there is no list.
function extractCardProps(paragraph: Paragraph): Record<string, string | undefined> {
  const first = paragraph.children.at(1);
  if (first?.type !== "text" || !first.value.startsWith("{")) return {};
  let combined = "";
  let remainder = "";
  let end = -1;
  for (let i = 1; i < paragraph.children.length; i++) {
    const node = paragraph.children.at(i);
    if (node?.type === "text") {
      const close = node.value.indexOf("}");
      if (close !== -1) {
        combined += node.value.slice(0, close + 1);
        remainder = node.value.slice(close + 1);
        end = i;
        break;
      }
      combined += node.value;
    } else if (node?.type === "link") {
      combined += node.url;
    } else {
      break; // anything else inside the braces: not a valid option list
    }
  }
  const parsed = end === -1 ? null : parseAttrs(combined);
  if (parsed === null) return {};
  // Replace the consumed nodes (indexes 1..end) with the leftover description text.
  paragraph.children.splice(1, end, { type: "text", value: remainder });
  return parsed.props;
}

function buildCard(state: State, item: ListItem, groupHorizontal: boolean): Element {
  const paragraph = item.children.at(0);
  const firstInline = paragraph?.type === "paragraph" ? paragraph.children.at(0) : undefined;
  const titleNode =
    firstInline?.type === "link" || firstInline?.type === "strong" ? firstInline : null;

  // No recognizable title -> a plain card, rendered as-is.
  if (titleNode === null || paragraph?.type !== "paragraph") {
    return h("div", { class: ["border", "p-6", ...BODY_RESET] }, state.all(item));
  }

  const href = titleNode.type === "link" ? titleNode.url : null;

  // Options from the `{ ... }` right after the title. Read with reconstruction so
  // an autolinked URL inside it (e.g. img=https://...) is handled.
  const props = extractCardProps(paragraph);

  const theme = cardTheme(props.type);
  const horizontal = groupHorizontal || props.horizontal === "true";

  // Title (built before the paragraph is mutated for the description). A link is
  // stretched over the whole card (.card-link); bold text is a static title.
  const titleChildren = state.all(titleNode);
  const title =
    href !== null
      ? h(
          "a",
          {
            href,
            class: [
              "card-link",
              "block",
              "font-medium",
              "text-foreground",
              "no-underline",
              "group-hover:text-primary",
            ],
          },
          titleChildren,
        )
      : h("span", { class: ["block", "font-medium", "text-foreground"] }, titleChildren);

  // Icon: an explicit `{ icon=name }` (any Lucide icon) or the type's default.
  const iconColor = theme !== undefined ? theme.text : "text-muted-foreground";
  let icon: Element | null = null;
  if (props.icon !== undefined && props.icon !== "true") {
    icon = lucideIconHast(props.icon, `size-5 ${iconColor}`);
  } else if (theme !== undefined) {
    icon = iconHast(theme.icon, `size-5 ${iconColor}`);
  }

  // Description: strip the title (and consumed attr text) from the paragraph, drop
  // the paragraph if nothing's left, then render the remainder as a muted block.
  paragraph.children.shift();
  const lead = paragraph.children.at(0);
  if (lead?.type === "text") lead.value = lead.value.trimStart();
  if (paragraph.children.length === 0) item.children.shift();
  const descendants = state.all(item);
  const description =
    descendants.length > 0
      ? h(
          "div",
          { class: ["mt-1", "text-sm", "text-muted-foreground", ...BODY_RESET] },
          descendants,
        )
      : null;

  const cta = buildCta(props, href);

  // The card frame (border + theme + hover); padding is added per layout below,
  // because an image card pushes the image flush and pads only the content.
  const frame = ["card", "group", "relative", "border", "transition-colors"];
  if (theme !== undefined) frame.push(theme.border, theme.body);
  if (href !== null) frame.push("hover:border-primary/50");

  const iconRow = icon === null ? [] : [h("span", { class: ["mb-3", "inline-flex"] }, [icon])];
  const body: ElementContent[] = [
    ...iconRow,
    title,
    ...(description === null ? [] : [description]),
    ...(cta === null ? [] : [cta]),
  ];

  if (horizontal) {
    const left = icon === null ? [] : [h("span", { class: ["shrink-0", "pt-0.5"] }, [icon])];
    const right = h("div", { class: ["min-w-0", "flex-1"] }, [
      title,
      ...(description === null ? [] : [description]),
      ...(cta === null ? [] : [cta]),
    ]);
    return h("div", { class: [...frame, "p-6", "flex", "items-start", "gap-4", ...BODY_RESET] }, [
      ...left,
      right,
    ]);
  }

  // Image card: the image is the first child at full card width and natural ratio
  // (height follows width), flush to the edges; the rest sits in a padded inner
  // div below it. m-0 cancels the prose img margin so there is no gap at the top.
  if (props.img !== undefined && props.img !== "true") {
    const img = h("img", { src: props.img, alt: "", class: ["block", "h-auto", "w-full"] });
    // [&>img]:m-0 (specificity .card>img) beats the prose img margin (.prose
    // :where(img)), so the image is truly flush, no gap above or below it.
    return h("div", { class: [...frame, "[&>img]:m-0"] }, [
      img,
      h("div", { class: ["p-6", ...BODY_RESET] }, body),
    ]);
  }

  // Plain vertical card: padded, icon/title/description/cta stacked.
  return h("div", { class: [...frame, "p-6", ...BODY_RESET] }, body);
}

/** remark-rehype handler logic: a `!!! cards` admonition to a responsive grid of
 *  cards. Group options live in the opener attrs (`{ cols=N horizontal }`). */
export function renderCards(state: State, node: Admonition): Element {
  const cols = parseCols(node.attrs);
  const grid = cols === null ? COLS_AUTO : COLS_CLASSES[cols];
  const groupHorizontal = node.attrs.split(" ").includes("horizontal");
  const cards = bodyListItems(node).map((item) => buildCard(state, item, groupHorizontal));
  return h("div", { class: ["my-4", "grid", "gap-4", ...grid] }, cards);
}
