import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { h, s } from "hastscript";
import { toString as mdastToString } from "mdast-util-to-string";
import type { Root as HastRoot, Element, ElementContent } from "hast";
import type { Root as MdastRoot } from "mdast";
import {
  remarkDocomd,
  remarkAttrList,
  remarkBlockAttrList,
  remarkTabGroup,
  remarkChart,
} from "$lib/markdown/docomd";
import { slugify } from "$lib/slug";
import { admonitionHandler } from "./admonition.ts";
import { tabbedSetHandler } from "./tabs.ts";
import { rehypeIconShortcodes } from "./icon-shortcode.ts";
import { remarkCode, codeHandler, type Highlight } from "./code.ts";
import { remarkVars } from "./vars.ts";
import { chartHandler } from "./chart.ts";
import { rehypeAnnotations } from "./annotations.ts";
import { remarkInlineEnhance } from "./inline-enhance.ts";
import { remarkMedia } from "./media.ts";
import { iconHast } from "./icons.ts";
import { rehypeSanitizeUrls } from "./sanitize.ts";

// docolin's markdown renderer, built on remark/rehype + the docomd syntax. The
// pipeline is isomorphic; only the shiki highlighter differs (static on the
// server, lazy on the client), so it is injected. Raw HTML in markdown is dropped
// (remark-rehype default) and attr-list only sets class/id, so the sole XSS
// surface is dangerous URL schemes; rehypeSanitizeUrls strips those (and any on*
// attributes) on the HAST tree, which works at the edge unlike a DOM-based
// sanitizer.

// Bump to invalidate every cached rendered page on the next read (it changes the
// cache key); no DB backfill needed.
// 3: docomd feature wave (diff viewer, output box, swatches/copy, media, linenums
//    starts, labeled diff fallback).
// 4: re-purge only. The wave's docs were synced and read while the old worker was
//    still live, so broken renders of the new syntax got edge-cached in the
//    deploy window. Ship renderer logic and the docs that use it in SEPARATE
//    deploys (renderer first, docs after it is live) to avoid this window.
// 5: interactive variables (!!! inputs cards, {{ expr }} markers in prose + code).
export const RENDERER_VERSION = "5";

/** Shiki dual theme: light + dark emitted together as CSS variables
 *  (`defaultColor: false`), so rendered code switches with the `.dark` class with
 *  no re-highlight. Pass to the injected highlighter (server + client preview). */
export const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;

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

// GitHub-style heading anchors: prepend a link icon to each in-content heading
// (h2-h6 already carry an id from remarkHeadingIds). CSS reveals it on hover;
// clicking jumps to and addresses that section. h1 is the (hidden) doco title,
// so it's skipped.
function rehypeHeadingAnchors() {
  const headings = new Set(["h2", "h3", "h4", "h5", "h6"]);
  return (tree: HastRoot): undefined => {
    visit(tree, "element", (node) => {
      if (!headings.has(node.tagName)) return;
      const id = node.properties.id;
      if (typeof id !== "string" || id.length === 0) return;
      node.children.unshift(
        h("a", { class: "heading-anchor", href: `#${id}`, "aria-label": "Link to this section" }, [
          iconHast("link", "heading-anchor-icon"),
        ]),
      );
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
// renderer did. md-button is the outline variant; md-button--primary fills it. The
// non-Tailwind `doco-button` marker is a stable hook (the md-button class is replaced
// here) so link hovercards can skip buttons.
const BUTTON_BASE = [
  "doco-button",
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

// The backref link content for each footnote definition (remark-rehype calls this
// once per reference). The first reference gets a quiet return arrow; re-references
// get a bare superscript index, so a thrice-cited note reads "↩ 2 3" instead of
// gfm's confusing "↩ ↩2 ↩3". (rereferenceIndex is 1-based.)
function footnoteBackContent(_referenceIndex: number, rereferenceIndex: number): ElementContent {
  if (rereferenceIndex > 1) return h("sup", String(rereferenceIndex));
  return iconHast("undo-2", "footnote-backref-icon");
}

/** Builds a render function bound to a shiki highlighter. */
export function createMarkdownRenderer(highlight: Highlight): (source: string) => Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDocomd)
    .use(remarkTabGroup)
    .use(remarkAttrList)
    .use(remarkChart)
    .use(remarkBlockAttrList)
    .use(remarkVars)
    .use(remarkInlineEnhance)
    .use(remarkMedia)
    .use(remarkHeadingIds)
    .use(remarkCode, highlight)
    .use(remarkRehype, {
      footnoteBackContent,
      handlers: {
        admonition: admonitionHandler,
        code: codeHandler,
        docoTabbedSet: tabbedSetHandler,
        docoChart: chartHandler,
      },
    })
    .use(rehypeKatex)
    .use(rehypeButtons)
    .use(rehypeExternalLinks)
    .use(rehypeHeadingAnchors)
    .use(rehypeTaskLists)
    .use(rehypeIconShortcodes)
    .use(rehypeAnnotations)
    .use(rehypeSanitizeUrls)
    .use(rehypeStringify);

  return async (source: string): Promise<string> => {
    const file = await processor.process(source);
    return String(file);
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

// Average adult silent reading speed for technical prose, the same number every
// other "min read" estimator uses. Lower bound, so a 1-word page rounds up to 1
// minute (a "0 min read" badge reads as broken).
const WORDS_PER_MINUTE = 200;

/** Estimated reading minutes for a doco body, derived from the word count. A
 *  whitespace-token split is good enough; the rendered HTML reorders words but
 *  doesn't add or remove enough to move the rounded result. Always at least 1.
 *  Lives here (not the server wrapper) so the client preview reuses it. */
export function extractReadingMinutes(source: string): number {
  let words = 0;
  let inWord = false;
  for (const c of source) {
    const isSpace = c === " " || c === "\t" || c === "\n" || c === "\r";
    if (isSpace) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      words += 1;
    }
  }
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
