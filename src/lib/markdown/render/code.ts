import { h } from "hastscript";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Code, Root as MdastRoot } from "mdast";
import type { State } from "mdast-util-to-hast";
import { visit } from "unist-util-visit";
import { iconHast } from "./icons.ts";
import { injectLineVars } from "./vars.ts";

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
  /** The starting line number when the author enabled line numbers, else null. */
  linenumStart: number | null;
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

// `linenums` (bare or ="1") starts numbering at 1; `linenums="42"` starts at 42, so a
// snippet can carry the line numbers it has in its real file. Non-positive / malformed
// values fall back to 1.
function parseLinenums(meta: string): number | null {
  if (!meta.includes("linenums")) return null;
  const value = extractQuoted(meta, "linenums");
  if (value === null) return 1;
  const start = Number(value);
  return Number.isInteger(start) && start > 0 ? start : 1;
}

function parseCodeMeta(meta: string | null | undefined): CodeMeta {
  if (typeof meta !== "string" || meta.length === 0) {
    return { title: null, hlLines: new Set(), linenumStart: null };
  }
  const hl = extractQuoted(meta, "hl_lines");
  return {
    title: extractQuoted(meta, "title"),
    hlLines: hl === null ? new Set() : parseLineRanges(hl),
    linenumStart: parseLinenums(meta),
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

// The select + copy buttons, shared by the header bar (titled blocks) and the
// floating overlay (untitled blocks).
function actionButtons(): ElementContent[] {
  return [
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
        iconHast("check", "code-check-icon size-4 text-emerald-600 dark:text-emerald-400"),
      ],
    ),
  ];
}

// Header bar for a titled block: filename on the left, language + buttons right.
function header(title: string, lang: string): Element {
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
    ...actionButtons(),
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
    [h("span", { class: ["truncate", "font-medium", "text-foreground"] }, title), right],
  );
}

// Untitled blocks skip the header bar; the buttons float over the code's top-right
// on a chip whose background matches the code (set in layout.css from shiki's vars).
function floatingActions(): Element {
  return h(
    "div",
    {
      class: [
        "code-actions",
        "absolute",
        "top-1.5",
        "right-1.5",
        "z-10",
        "flex",
        "items-center",
        "gap-2",
        "px-2",
        "py-1",
      ],
    },
    actionButtons(),
  );
}

function fallbackPre(value: string): Element {
  return h("pre", [h("code", value)]);
}

async function processCode(node: Code, blockIndex: number, highlight: Highlight): Promise<void> {
  const meta = parseCodeMeta(node.meta);
  const lang =
    node.lang === null || node.lang === undefined || node.lang === "" ? "text" : node.lang;
  // Mermaid is not syntax-highlighted: emit the source in a .mermaid element for
  // the client to lazy-render. The raw source is the no-JS / SEO fallback (and the
  // client caches it before rendering, so it can re-render on a theme change).
  if (lang === "mermaid") {
    builtBlocks.set(node, h("pre", { class: ["mermaid", "not-prose", "my-4"] }, node.value));
    return;
  }
  let pre: Element;
  try {
    const root = await highlight(node.value, lang);
    const first = root.children[0];
    pre = first.type === "element" ? first : fallbackPre(node.value);
  } catch (error) {
    // A broken highlighter must never take down the doco render, so fall back
    // to the plain source. Logged loudly: this degrades every block on the page
    // (no colors, no line ids, no line select) and once shipped invisibly.
    console.error(`code highlight failed (lang=${lang})`, error);
    pre = fallbackPre(node.value);
  }
  // Every block gets shareable lines (ids + a gutter number revealed on hover),
  // so a reader can highlight a line even when the author did not number the block.
  restructureLines(pre, blockIndex, meta.hlLines);

  // Splice `{{ expr }}` markers into the highlighted lines (interactive
  // variables). remarkVars annotated the node with the doc's declared names;
  // absent when the doc declares none or this fence opted out via `novars`.
  const varNames = (node.data as { docoVarNames?: string[] } | undefined)?.docoVarNames;
  if (varNames !== undefined && varNames.length > 0) {
    const declared = new Set(varNames);
    for (const child of pre.children) {
      if (child.type !== "element" || child.tagName !== "code") continue;
      for (const line of child.children) {
        if (line.type === "element") injectLineVars(line, declared);
      }
    }
  }

  // not-prose opts the block out of @tailwindcss/typography so its own styling
  // (layout.css) applies without a specificity fight. relative anchors the floating
  // actions; code-linenums keeps the gutter numbers always on (author opted in).
  const wrapperClass = [
    "code-block",
    "not-prose",
    "group",
    "relative",
    "my-4",
    "border",
    "border-border",
  ];
  if (meta.linenumStart !== null) wrapperClass.push("code-linenums");
  // Titled blocks get the header bar; untitled ones float the buttons over the code.
  const top = meta.title === null ? floatingActions() : header(meta.title, lang);
  const block = h("div", { class: wrapperClass }, [
    top,
    h("div", { class: ["code-body", "overflow-x-auto"] }, [pre]),
  ]);
  // Mirror shiki's bg vars onto the wrapper so the floating chip matches the code, and
  // carry the line-number start: a CSS counter offset for this block, and the value the
  // diff viewer reads to number its gutters from.
  const style = pre.properties.style;
  const styleParts = typeof style === "string" ? [style] : [];
  if (meta.linenumStart !== null) {
    const lineCount = node.value.split("\n").length - (node.value.endsWith("\n") ? 1 : 0);
    const lastNumber = meta.linenumStart + Math.max(lineCount - 1, 0);
    block.properties["data-line-start"] = String(meta.linenumStart);
    // Offset the counter, and size the gutter to the widest number so a high start
    // (e.g. linenums="1240") does not clip.
    styleParts.push(`--line-start:${String(meta.linenumStart - 1)}`);
    styleParts.push(`--line-digits:${String(String(lastNumber).length)}`);
  }
  if (styleParts.length > 0) block.properties.style = styleParts.join(";");

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
