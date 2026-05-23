import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { h, s } from "hastscript";
import { toString as mdastToString } from "mdast-util-to-string";
import DOMPurify from "isomorphic-dompurify";
import type { Root as HastRoot, Element } from "hast";
import type { Root as MdastRoot } from "mdast";
import { remarkDocomd, remarkAttrList, remarkTabGroup } from "$lib/markdown/docomd";
import { slugify } from "$lib/slug";
import { admonitionHandler } from "./admonition.ts";
import { tabbedSetHandler } from "./tabs.ts";
import { remarkCode, codeHandler, type Highlight } from "./code.ts";

// docolin's markdown renderer, built on remark/rehype + the docomd syntax. The
// pipeline is isomorphic; only the shiki highlighter differs (static on the
// server, lazy on the client), so it is injected. Output is sanitized with the
// same DOMPurify config the marked renderer used, so the security surface is
// unchanged. Raw HTML in markdown is dropped (remark-rehype default), which is
// safer and fine for community docs.

// Bump to invalidate every cached rendered page on the next read (it changes the
// cache key); no DB backfill needed.
export const RENDERER_VERSION = "1";

// `name`/`type`/`checked`/`for` drive the content-tab radio group; `name` is also
// the exclusive-open accordion key (<details name>); `open` the collapsible state;
// the rest carry classes/anchors/shiki styles/link rels.
const SANITIZE_ADD_ATTR = [
  "class",
  "target",
  "rel",
  "id",
  "style",
  "open",
  "name",
  "type",
  "checked",
  "for",
];

/** Sanitizes rendered HTML. One step shared by every render path. */
export function sanitizeHtml(raw: string): string {
  return DOMPurify.sanitize(raw, { ADD_ATTR: SANITIZE_ADD_ATTR });
}

// mdast: give every heading an id matching extractToc's slug, so in-page anchors
// line up with the table of contents.
function remarkHeadingIds() {
  return (tree: MdastRoot): undefined => {
    visit(tree, "heading", (node) => {
      const data = node.data ?? (node.data = {});
      const props = data.hProperties ?? (data.hProperties = {});
      props.id = slugify(mdastToString(node));
    });
  };
}

// hast: open external links in a new tab with noopener (internal links, starting
// with "/" or "#", stay same-tab). Matches the previous renderer.
function rehypeExternalLinks() {
  return (tree: HastRoot): undefined => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a") return;
      const href = node.properties.href;
      if (typeof href !== "string") return;
      if (href.startsWith("/") || href.startsWith("#")) return;
      node.properties.target = "_blank";
      node.properties.rel = ["noopener", "noreferrer"];
    });
  };
}

// Read-only checkbox styled like the shadcn Checkbox (we cannot mount a Svelte
// component into rendered HTML, so we emit the same look).
function shadcnCheckbox(checked: boolean): Element {
  const box = [
    "mr-2",
    "inline-flex",
    "size-4",
    "shrink-0",
    "items-center",
    "justify-center",
    "border",
    "align-[-0.2em]",
  ];
  if (!checked) {
    return h("span", {
      role: "checkbox",
      "aria-checked": "false",
      "aria-disabled": "true",
      class: [...box, "border-input", "bg-background"],
    });
  }
  return h(
    "span",
    {
      role: "checkbox",
      "aria-checked": "true",
      "aria-disabled": "true",
      class: [...box, "border-primary", "bg-primary", "text-primary-foreground"],
    },
    [
      s(
        "svg",
        {
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 3,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          class: "size-3",
        },
        [s("path", { d: "M20 6 9 17l-5-5" })],
      ),
    ],
  );
}

// hast: swap GFM task-list <input> checkboxes for the shadcn look and drop the
// list bullet on task items (GitHub-style), matching the previous renderer.
function rehypeTaskLists() {
  return (tree: HastRoot): undefined => {
    visit(tree, "element", (node, index, parent) => {
      if (
        node.tagName === "input" &&
        node.properties.type === "checkbox" &&
        parent !== undefined &&
        index !== undefined
      ) {
        parent.children[index] = shadcnCheckbox(node.properties.checked === true);
        return;
      }
      if (node.tagName === "li") {
        const cls = node.properties.className;
        if (Array.isArray(cls) && cls.includes("task-list-item")) {
          node.properties.className = ["list-none"];
        }
      }
    });
  };
}

// Tailwind utilities for attr-list buttons. Set as classes on the <a> (rather
// than a CSS rule) so they win over the .prose link styling, the same way the old
// renderer did. md-button is the outline variant; md-button--primary fills it.
const BUTTON_BASE = [
  "inline-flex",
  "h-11",
  "items-center",
  "gap-2",
  "px-5",
  "text-base",
  "font-medium",
  "no-underline",
  "transition-colors",
];
const BUTTON_SECONDARY = [
  ...BUTTON_BASE,
  "border",
  "border-input",
  "text-foreground",
  "hover:bg-accent",
];
const BUTTON_PRIMARY = [
  ...BUTTON_BASE,
  "bg-primary",
  "text-primary-foreground",
  "hover:bg-primary/90",
];

// hast: turn links carrying the md-button attr-list classes into styled buttons.
function rehypeButtons() {
  return (tree: HastRoot): undefined => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a") return;
      const cls = node.properties.className;
      if (!Array.isArray(cls) || !cls.includes("md-button")) return;
      node.properties.className = cls.includes("md-button--primary")
        ? BUTTON_PRIMARY
        : BUTTON_SECONDARY;
    });
  };
}

/** Builds a render function bound to a shiki highlighter. */
export function createMarkdownRenderer(highlight: Highlight): (source: string) => Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDocomd)
    .use(remarkTabGroup)
    .use(remarkAttrList)
    .use(remarkHeadingIds)
    .use(remarkCode, highlight)
    .use(remarkRehype, {
      handlers: {
        admonition: admonitionHandler,
        code: codeHandler,
        docoTabbedSet: tabbedSetHandler,
      },
    })
    .use(rehypeButtons)
    .use(rehypeExternalLinks)
    .use(rehypeTaskLists)
    .use(rehypeStringify);

  return async (source: string): Promise<string> => {
    const file = await processor.process(source);
    return sanitizeHtml(String(file));
  };
}

// ---------- Table of contents ----------

export interface TocEntry {
  level: number;
  text: string;
  id: string;
}

const tocProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkDocomd);

/** Pulls top-level h2/h3 headings for the doco viewer's table of contents. h1 is
 *  the page title (shown separately) and h4+ is too granular. */
export function extractToc(source: string): TocEntry[] {
  const tree = tocProcessor.parse(source);
  const out: TocEntry[] = [];
  for (const node of tree.children) {
    if (node.type !== "heading") continue;
    if (node.depth !== 2 && node.depth !== 3) continue;
    const text = mdastToString(node);
    out.push({ level: node.depth, text, id: slugify(text) });
  }
  return out;
}
