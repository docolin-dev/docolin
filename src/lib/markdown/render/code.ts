import { h } from "hastscript";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Code, Root as MdastRoot } from "mdast";
import type { State } from "mdast-util-to-hast";
import { visit } from "unist-util-visit";
import { iconHast } from "./icons.ts";

// docolin's code-block renderer. We run shiki ourselves (rather than
// rehype-pretty-code) for full control over the markup and the MkDocs-style
// meta. A code fence's info string carries:
//
//   ```ts title="hooks.server.ts" hl_lines="2 5-7" linenums="1"
//
// title -> a filename in the header bar; hl_lines -> highlighted lines;
// linenums -> line numbers. The header bar always shows the language and a copy
// button. This runs at the mdast level (where the fence `meta` is available) and
// attaches the built hast via the node's data, so remark-rehype emits it.

/** Highlights code to a hast root whose first child is the <pre>. Injected so the
 *  server uses a static shiki and the client a lazy one. */
export type Highlight = (code: string, lang: string) => Promise<HastRoot>;

// Bridges the async highlight (run in the remark phase, where the fence `meta` is
// available) to the sync remark-rehype `code` handler below. Keyed by the mdast
// node, which is unique per render, so concurrent renders never collide and
// entries are garbage-collected with their tree.
const builtBlocks = new WeakMap<Code, Element>();

interface CodeMeta {
  title: string | null;
  hlLines: Set<number>;
  linenums: boolean;
}

function extractQuoted(meta: string, key: string): string | null {
  const needle = `${key}="`;
  const start = meta.indexOf(needle);
  if (start === -1) return null;
  const from = start + needle.length;
  const end = meta.indexOf('"', from);
  return end === -1 ? null : meta.slice(from, end);
}

// "2 5-7" -> {2, 5, 6, 7}. String ops only (no regex).
function parseLineRanges(raw: string): Set<number> {
  const lines = new Set<number>();
  for (const part of raw.split(" ")) {
    const token = part.trim();
    if (token.length === 0) continue;
    const dash = token.indexOf("-");
    if (dash === -1) {
      const value = Number(token);
      if (Number.isInteger(value)) lines.add(value);
      continue;
    }
    const from = Number(token.slice(0, dash));
    const to = Number(token.slice(dash + 1));
    if (Number.isInteger(from) && Number.isInteger(to)) {
      for (let line = from; line <= to; line++) lines.add(line);
    }
  }
  return lines;
}

function parseCodeMeta(meta: string | null | undefined): CodeMeta {
  if (typeof meta !== "string" || meta.length === 0) {
    return { title: null, hlLines: new Set(), linenums: false };
  }
  const hl = extractQuoted(meta, "hl_lines");
  return {
    title: extractQuoted(meta, "title"),
    hlLines: hl === null ? new Set() : parseLineRanges(hl),
    linenums: meta.includes("linenums"),
  };
}

// shiki marks each line with a `class` string ("line"), not hast's array-valued
// `className`, so we read and append to that key.
function lineClass(node: Element): string {
  const cls = node.properties.class;
  return typeof cls === "string" ? cls : "";
}

function isLine(node: Element): boolean {
  return lineClass(node).split(" ").includes("line");
}

/** Per-line id, shared with the line-select script. `#__codeline-0-5` is also a
 *  valid CSS `:target`, so a single shared line highlights with no JS at all. */
export function lineId(blockIndex: number, line: number): string {
  return `__codeline-${String(blockIndex)}-${String(line)}`;
}

// Turns shiki's inline lines into block-level lines, each with a stable id so any
// line is a CSS :target and the line-select script can address it. Also marks
// author hl_lines and drops shiki's inter-line newline text nodes (the block lines
// provide the breaks). No-op on a fallback <pre> with no shiki lines.
function restructureLines(pre: Element, blockIndex: number, hlLines: Set<number>): void {
  const code = pre.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  );
  if (code === undefined) return;
  const lines = code.children.filter(
    (child): child is Element => child.type === "element" && isLine(child),
  );
  if (lines.length === 0) return;
  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    line.properties.id = lineId(blockIndex, number);
    if (hlLines.has(number)) line.properties.class = `${lineClass(line)} line-highlight`;
  }
  code.children = lines;
}

function header(title: string | null, lang: string): Element {
  const left: ElementContent[] =
    title === null
      ? []
      : [h("span", { class: ["truncate", "font-medium", "text-foreground"] }, title)];
  const showLang = lang.length > 0 && lang !== "text";
  const right = h("div", { class: ["ml-auto", "flex", "items-center", "gap-3"] }, [
    ...(showLang
      ? [
          h(
            "span",
            { class: ["font-mono", "text-[0.7rem]", "uppercase", "text-muted-foreground"] },
            lang,
          ),
        ]
      : []),
    h(
      "button",
      {
        type: "button",
        class: ["code-select", "inline-flex"],
        "data-code-select": "",
        "aria-pressed": "false",
        "aria-label": "Select lines to highlight",
        title: "Select lines to highlight",
      },
      [iconHast("text-select", "size-4")],
    ),
    h(
      "button",
      {
        type: "button",
        class: [
          "code-copy",
          "inline-flex",
          "text-muted-foreground",
          "transition-colors",
          "hover:text-foreground",
        ],
        "data-code-copy": "",
        "aria-label": "Copy code",
        title: "Copy code",
      },
      [
        iconHast("copy", "code-copy-icon size-4"),
        iconHast("check", "code-check-icon size-4 text-emerald-600"),
      ],
    ),
  ]);
  return h(
    "div",
    {
      class: [
        "code-header",
        "flex",
        "items-center",
        "gap-3",
        "border-b",
        "border-border",
        "bg-muted",
        "px-3",
        "py-1.5",
        "text-xs",
      ],
    },
    [...left, right],
  );
}

function fallbackPre(value: string): Element {
  return h("pre", [h("code", value)]);
}

async function processCode(node: Code, blockIndex: number, highlight: Highlight): Promise<void> {
  const meta = parseCodeMeta(node.meta);
  const lang =
    node.lang === null || node.lang === undefined || node.lang === "" ? "text" : node.lang;
  let pre: Element;
  try {
    const root = await highlight(node.value, lang);
    const first = root.children[0];
    pre = first.type === "element" ? first : fallbackPre(node.value);
  } catch {
    pre = fallbackPre(node.value);
  }
  // Every block gets shareable lines (ids + a gutter number revealed on hover),
  // so a reader can highlight a line even when the author did not number the block.
  restructureLines(pre, blockIndex, meta.hlLines);

  // not-prose opts the block out of @tailwindcss/typography so its own styling
  // (layout.css) applies without a specificity fight. code-linenums keeps the
  // gutter numbers always on (author opted in); otherwise they reveal on hover.
  const wrapperClass = ["code-block", "not-prose", "group", "my-4", "border", "border-border"];
  if (meta.linenums) wrapperClass.push("code-linenums");
  const block = h("div", { class: wrapperClass }, [
    header(meta.title, lang),
    h("div", { class: ["code-body", "overflow-x-auto"] }, [pre]),
  ]);

  builtBlocks.set(node, block);
}

/** remark plugin: highlight fenced code blocks with shiki + build their header
 *  bar. Runs in the remark phase (the fence `meta` only exists on mdast) and
 *  stashes the built hast for {@link codeHandler} to emit. The block index is the
 *  fence's document order, so line ids (and shared URLs) are stable per render. */
export function remarkCode(highlight: Highlight) {
  return async (tree: MdastRoot): Promise<undefined> => {
    let blockIndex = 0;
    const jobs: Promise<void>[] = [];
    visit(tree, "code", (node) => {
      const index = blockIndex;
      blockIndex += 1;
      jobs.push(processCode(node, index, highlight));
    });
    await Promise.all(jobs);
    return undefined;
  };
}

/** remark-rehype handler for `code` nodes. Returns the block built by
 *  {@link remarkCode}. We must override the handler (rather than set the node's
 *  `hName`/`hChildren`) because mdast-util-to-hast's default `code` handler
 *  unconditionally wraps the result in a `<pre>`, and that outer `<pre>` lands
 *  outside our `not-prose` wrapper, where @tailwindcss/typography repaints it
 *  with a dark background. */
export function codeHandler(_state: State, node: Code): Element {
  return (
    builtBlocks.get(node) ??
    h("div", { class: ["code-block", "not-prose"] }, [h("pre", [h("code", node.value)])])
  );
}
