import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import remarkStringify from "remark-stringify";
import type { Plugin } from "unified";
import type {
  Root,
  RootContent,
  BlockContent,
  DefinitionContent,
  PhrasingContent,
  Paragraph,
  Text,
  List,
  ListItem,
  Code,
} from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import {
  admonitionToMarkdown,
  tabToMarkdown,
  type Admonition,
  type DocoTab,
} from "$lib/markdown/docomd";

// Converts a Mintlify MDX body to docolin's docomd markdown. The JSX components
// Mintlify ships (Note, Steps, Card, Accordion, Tabs, CodeGroup, ...) are parsed
// with remark-mdx into mdast JSX nodes, then rewritten into docomd's own mdast
// nodes (admonitions, tabs) or plain markdown, and stringified. Anything we do
// not recognize is unwrapped (its inner markdown is kept, the wrapper dropped) so
// no prose is ever lost. Frontmatter is handled separately by the orchestrator.

type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;
type Block = BlockContent | DefinitionContent;

// Mintlify callout components -> docomd admonition type. Check is a green
// success box in Mintlify; docomd has no success type, so it maps to tip.
const CALLOUT_TYPE: Record<string, string> = {
  note: "note",
  info: "info",
  tip: "tip",
  check: "tip",
  warning: "warning",
  caution: "warning",
  danger: "danger",
  error: "danger",
};

function isJsx(node: RootContent): node is JsxElement {
  return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
}

function nameOf(node: JsxElement): string {
  return (node.name ?? "").toLowerCase();
}

// Reads a JSX attribute as a string: a string literal verbatim, an expression
// (`cols={2}`) as its raw source, and a bare boolean attribute (`horizontal`) as
// "". Returns null when the attribute is absent.
function attr(node: JsxElement, name: string): string | null {
  for (const a of node.attributes) {
    if (a.type !== "mdxJsxAttribute" || a.name !== name) continue;
    const value = a.value;
    // null / undefined => bare boolean attribute (present, no value).
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    return value.value;
  }
  return null;
}

function hasAttr(node: JsxElement, name: string): boolean {
  return attr(node, name) !== null;
}

function firstAttr(node: JsxElement, names: string[]): string | null {
  for (const name of names) {
    const value = attr(node, name);
    if (value !== null) return value;
  }
  return null;
}

// ---------- node builders ----------

const text = (value: string): Text => ({ type: "text", value });

function paragraph(children: PhrasingContent[]): Paragraph {
  return { type: "paragraph", children };
}

function admonition(
  atype: string,
  title: string,
  children: Block[],
  opts: { collapsible?: boolean; open?: boolean; attrs?: string } = {},
): Admonition {
  return {
    type: "admonition",
    collapsible: opts.collapsible ?? false,
    open: opts.open ?? false,
    atype,
    title,
    attrs: opts.attrs ?? "",
    children,
  };
}

// ---------- transform ----------

// Collects child components matching any of `names`. When block JSX is authored
// without blank lines between siblings, MDX parses them as inline JSX inside a
// paragraph, so we also look one level into paragraph children. This is why
// `<Tabs><Tab/><Tab/></Tabs>` works whether or not the tabs are blank-separated.
function collect(node: JsxElement, names: ReadonlySet<string>): JsxElement[] {
  const out: JsxElement[] = [];
  for (const child of node.children as RootContent[]) {
    if (isJsx(child) && names.has(nameOf(child))) {
      out.push(child);
    } else if (child.type === "paragraph") {
      for (const inner of child.children) {
        if (isJsx(inner) && names.has(nameOf(inner))) out.push(inner);
      }
    }
  }
  return out;
}

const STEP_NAMES: ReadonlySet<string> = new Set(["step"]);
const TAB_NAMES: ReadonlySet<string> = new Set(["tab"]);
const CARD_NAMES: ReadonlySet<string> = new Set(["card", "tile"]);
const ACCORDION_NAMES: ReadonlySet<string> = new Set(["accordion"]);

function convertChildren(children: RootContent[]): RootContent[] {
  const out: RootContent[] = [];
  for (const child of children) out.push(...convertNode(child));
  return out;
}

function convertNode(node: RootContent): RootContent[] {
  // Drop MDX-only noise: `{/* comments */}`, `{expressions}`, import/export.
  if (
    node.type === "mdxFlowExpression" ||
    node.type === "mdxTextExpression" ||
    node.type === "mdxjsEsm"
  ) {
    return [];
  }
  if (isJsx(node)) return convertComponent(node);
  // Recurse into ordinary containers so JSX nested inside lists, quotes, etc.
  // is converted too.
  if ("children" in node && Array.isArray(node.children)) {
    node.children = convertChildren(node.children) as typeof node.children;
  }
  return [node];
}

// Body of a component as docomd block content. An inline component (parsed as
// mdxJsxTextElement) holds phrasing children, so wrap them in a paragraph to keep
// the result valid block content.
function body(node: JsxElement): Block[] {
  const converted = convertChildren(node.children);
  if (node.type === "mdxJsxTextElement") {
    return [paragraph(converted as PhrasingContent[])];
  }
  return converted as Block[];
}

function convertComponent(node: JsxElement): RootContent[] {
  const name = nameOf(node);

  if (name in CALLOUT_TYPE) {
    return [admonition(CALLOUT_TYPE[name], attr(node, "title") ?? "", body(node))];
  }

  switch (name) {
    case "callout": {
      // Generic <Callout type="warning">: read the type, fall back to a note.
      const type = (attr(node, "type") ?? "").toLowerCase();
      return [admonition(CALLOUT_TYPE[type] ?? "note", attr(node, "title") ?? "", body(node))];
    }
    case "banner":
      return [admonition("info", attr(node, "title") ?? "", body(node))];
    case "steps":
      return [convertSteps(node)];
    case "cardgroup":
    case "columns":
    case "tiles":
      return convertCardContainer(node);
    case "card":
    case "tile":
      return [convertCards([node], null)];
    case "accordiongroup":
      return collect(node, ACCORDION_NAMES).flatMap(convertComponent);
    case "accordion":
    case "expandable":
      return [admonition("note", attr(node, "title") ?? "", body(node), { collapsible: true })];
    case "update":
      // A changelog entry: its version label becomes a collapsible-free note title.
      return [admonition("note", firstAttr(node, ["label", "title"]) ?? "", body(node))];
    case "tabs":
      return collect(node, TAB_NAMES).map(convertTab);
    case "tab":
      return [convertTab(node)];
    case "codegroup":
      return convertCodeGroup(node);
    case "paramfield":
    case "responsefield":
      return convertField(node);
    case "img":
      return convertImg(node);
    case "icon":
      return convertIcon(node);
    case "video":
    case "iframe":
      return convertEmbed(node);
    case "frame":
      // A media wrapper: unwrap it (the img/video/iframe inside converts on its
      // own) and keep its caption as a trailing italic line.
      return convertFrame(node);
    case "tree":
      return convertTree(node);
    default:
      // Everything else (Tooltip, Badge, Panel, Prompt, View, Visibility,
      // ResponseExample, ...) has no docomd equivalent; unwrap so its inner
      // prose survives and the wrapper is dropped. A self-closing component
      // simply disappears.
      return convertChildren(node.children);
  }
}

// CardGroup / Columns / Tiles: a grid of Card/Tile children. If it holds no
// cards, unwrap it so any other content survives.
function convertCardContainer(node: JsxElement): RootContent[] {
  const items = collect(node, CARD_NAMES);
  if (items.length === 0) return convertChildren(node.children);
  return [convertCards(items, attr(node, "cols"))];
}

function convertSteps(node: JsxElement): Admonition {
  // Loose list (spread) so a blank line is kept before a step's nested code
  // block; a tight list would glue them together and break the fence.
  const items: ListItem[] = collect(node, STEP_NAMES).map((step) => {
    const title = attr(step, "title") ?? "";
    const inner = body(step);
    const children: Block[] =
      title.length > 0
        ? [paragraph([{ type: "strong", children: [text(title)] }]), ...inner]
        : inner;
    return { type: "listItem", spread: true, checked: null, children };
  });
  const list: List = { type: "list", ordered: true, start: 1, spread: true, children: items };
  return admonition("steps", attr(node, "title") ?? "", [list]);
}

// A card list item: a linked or bold title, an attr-list of options
// (`{ icon=... }`), then the body as the description.
function convertCard(node: JsxElement): ListItem {
  const title = attr(node, "title") ?? "";
  const href = attr(node, "href");
  const opts: string[] = [];
  const icon = attr(node, "icon");
  if (icon !== null && icon.length > 0) opts.push(`icon=${prefixedIcon(icon)}`);
  const img = attr(node, "img");
  if (img !== null && img.length > 0) opts.push(`img=${img}`);
  if (hasAttr(node, "horizontal")) opts.push("horizontal");

  const titleNode: PhrasingContent =
    href !== null && href.length > 0
      ? { type: "link", url: href, children: [text(title)] }
      : { type: "strong", children: [text(title)] };
  const head: PhrasingContent[] = [titleNode];
  // The attr-list must abut the title with no leading space so the card parser
  // sees a text node starting with "{".
  if (opts.length > 0) head.push(text(`{ ${opts.join(" ")} }`));

  return {
    type: "listItem",
    spread: true,
    checked: null,
    children: [paragraph(head), ...body(node)],
  };
}

function convertCards(cards: JsxElement[], cols: string | null): Admonition {
  const list: List = {
    type: "list",
    ordered: false,
    spread: true,
    children: cards.map(convertCard),
  };
  const attrs = cols !== null && cols.length > 0 ? `cols=${cols}` : "";
  return admonition("cards", "", [list], { attrs });
}

// A JSX <img>. Mintlify duplicates an image per theme with Tailwind classes
// (`dark:hidden` for the light one, `hidden dark:block` for the dark one); map
// those to docolin's light/dark image attr-list (.light-only / .dark-only). A
// plain <img> becomes a plain markdown image.
function convertImg(node: JsxElement): RootContent[] {
  const src = attr(node, "src");
  if (src === null || src.length === 0) return [];
  const alt = attr(node, "alt") ?? "";
  const className = `${attr(node, "className") ?? ""} ${attr(node, "class") ?? ""}`;
  const head: PhrasingContent[] = [{ type: "image", url: src, alt }];
  if (className.includes("dark:hidden")) {
    head.push(text("{ .light-only }"));
  } else if (className.includes("dark:block")) {
    head.push(text("{ .dark-only }"));
  }
  return [paragraph(head)];
}

// A name the inline `:icon:` shortcode will accept: lowercase letters, digits,
// and hyphens only (mirrors the renderer's candidate check in
// src/lib/markdown/render/icon-shortcode.ts). String ops, no regex.
function isShortcodeName(name: string): boolean {
  if (name.length === 0) return false;
  for (const char of name) {
    const ok = (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-";
    if (!ok) return false;
  }
  return true;
}

// <Icon icon="download" /> -> the inline `:fa-download:` shortcode, carrying the
// project's icon set exactly like card icons do (prefixedIcon). A name the
// shortcode would not accept is dropped rather than left as literal `:x:` text.
function convertIcon(node: JsxElement): RootContent[] {
  const name = (attr(node, "icon") ?? "").trim().toLowerCase();
  if (!isShortcodeName(name)) return [];
  const shortcode = text(`:${prefixedIcon(name)}:`);
  // In flow position the bare text needs a paragraph to stay valid block content.
  return node.type === "mdxJsxFlowElement" ? [paragraph([shortcode])] : [shortcode];
}

// <video src> and YouTube <iframe src> map to docomd's image-as-video syntax
// (`![alt](url)`): the renderer plays a video file natively and turns a YouTube
// URL into the privacy facade, and its id parser already reads /embed/ URLs.
// A non-YouTube iframe has no docomd equivalent and is dropped.
function convertEmbed(node: JsxElement): RootContent[] {
  const src = attr(node, "src");
  if (src === null || src.length === 0) return [];
  if (nameOf(node) === "iframe" && !src.includes("youtube.com/") && !src.includes("youtu.be/")) {
    return [];
  }
  const alt = firstAttr(node, ["title", "alt"]) ?? "";
  return [paragraph([{ type: "image", url: src, alt }])];
}

function convertFrame(node: JsxElement): RootContent[] {
  const inner = convertChildren(node.children);
  const caption = attr(node, "caption");
  if (caption !== null && caption.length > 0) {
    inner.push(paragraph([{ type: "emphasis", children: [text(caption)] }]));
  }
  return inner;
}

const TREE_ENTRY_NAMES: ReadonlySet<string> = new Set([
  "tree.folder",
  "tree.file",
  "folder",
  "file",
]);

// One <Tree> level to a docomd list level. Folders recurse; an empty folder
// keeps its meaning through the trailing-slash marker docomd's tree uses.
function treeLevelToList(node: JsxElement): List {
  const items: ListItem[] = collect(node, TREE_ENTRY_NAMES).map((entry) => {
    const name = attr(entry, "name") ?? "";
    const children: Block[] = [];
    if (nameOf(entry).endsWith("folder")) {
      const sub = treeLevelToList(entry);
      if (sub.children.length > 0) {
        children.push(paragraph([text(name)]), sub);
      } else {
        children.push(paragraph([text(`${name}/`)]));
      }
    } else {
      children.push(paragraph([text(name)]));
    }
    return { type: "listItem", spread: false, checked: null, children };
  });
  return { type: "list", ordered: false, spread: false, children: items };
}

// <Tree> -> a nested unordered list followed by the `{ .tree }` marker, docomd's
// file-tree syntax. A Tree with no recognizable entries unwraps like any other
// unknown wrapper so nothing is lost.
function convertTree(node: JsxElement): RootContent[] {
  const list = treeLevelToList(node);
  if (list.children.length === 0) return convertChildren(node.children);
  return [list, paragraph([text("{ .tree }")])];
}

function convertTab(node: JsxElement): DocoTab {
  return { type: "docoTab", label: attr(node, "title") ?? "", children: body(node) };
}

// A CodeGroup is a tab set, one tab per fenced code block, labelled by the
// block's title meta (` ```bash cURL ` -> "cURL").
function convertCodeGroup(node: JsxElement): RootContent[] {
  const tabs: DocoTab[] = [];
  for (const child of node.children as RootContent[]) {
    if (child.type !== "code") continue;
    const code = child;
    // Label preference: the fence's title meta, else its language, else "Code".
    // Empty strings must fall through, so this is intentionally not `??`.
    const meta = (code.meta ?? "").trim();
    const lang = code.lang ?? "";
    const label = meta.length > 0 ? meta : lang.length > 0 ? lang : "Code";
    const inner: Code = { type: "code", lang: code.lang, value: code.value };
    tabs.push({ type: "docoTab", label, children: [inner] });
  }
  return tabs;
}

// ParamField / ResponseField: a header line summarizing the field
// (name, type, required, default) followed by the description.
function convertField(node: JsxElement): RootContent[] {
  const name = firstAttr(node, ["name", "query", "path", "header", "body"]) ?? "";
  const head: PhrasingContent[] = [
    { type: "strong", children: [{ type: "inlineCode", value: name }] },
  ];
  const type = attr(node, "type");
  if (type !== null && type.length > 0) {
    head.push(text(" · "), { type: "inlineCode", value: type });
  }
  if (hasAttr(node, "required")) head.push(text(" · required"));
  const def = attr(node, "default");
  if (def !== null && def.length > 0) {
    head.push(text(" · default "), { type: "inlineCode", value: def });
  }
  return [paragraph(head), ...body(node)];
}

// ---------- stringify ----------

// Registers the docomd serializers so the admonition / tab nodes we built write
// back as `!!!` / `===` source. gfm + math cover everything their bodies can hold.
const docomdToMarkdown: Plugin<[], Root> = function (): undefined {
  const data = this.data();
  const toMarkdownExtensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = []);
  toMarkdownExtensions.push(admonitionToMarkdown(), tabToMarkdown());
};

// Parsing and stringifying are split into two processors on purpose. remark-mdx
// is needed to PARSE the JSX, but its stringify side escapes `{` and `<` to keep
// output MDX-safe, which would mangle docomd attr-lists (`{ .dark-only }`,
// `{ icon=... }`). The stringifier therefore omits remark-mdx; by then the tree
// has no JSX left anyway.
const mdxParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkMdx);

const docomdStringifier = unified()
  .use(remarkGfm)
  .use(remarkMath)
  .use(docomdToMarkdown)
  .use(remarkStringify, {
    bullet: "-",
    emphasis: "_",
    fences: true,
    listItemIndent: "one",
    rule: "-",
    ruleSpaces: false,
  });

export interface MdxConvertOptions {
  /** The project's Mintlify icon library. Card icon names are rewritten with its
   *  set prefix (`fa:` / `tabler:`) so the renderer leads with the right set;
   *  lucide and null leave names bare (docolin's default). */
  iconLibrary?: "fontawesome" | "lucide" | "tabler" | null;
}

// Set for the duration of one synchronous conversion and read by convertCard.
// Safe because the whole pipeline below runs without yielding.
let currentIconLibrary: MdxConvertOptions["iconLibrary"] = null;

// Prefixes a card icon name with the project's set, so `plug` -> `fa-plug` for a
// Font Awesome project. Lucide (docolin's default) leaves the name bare.
function prefixedIcon(name: string): string {
  if (currentIconLibrary === "fontawesome") return `fa-${name}`;
  if (currentIconLibrary === "tabler") return `tb-${name}`;
  return name;
}

/** Converts a Mintlify MDX body (frontmatter already stripped) to docomd markdown. */
export function mdxBodyToDocomd(mdxBody: string, options: MdxConvertOptions = {}): string {
  currentIconLibrary = options.iconLibrary ?? null;
  const tree = mdxParser.parse(mdxBody);
  tree.children = convertChildren(tree.children);
  const out = docomdStringifier.stringify(tree);
  currentIconLibrary = null;
  return out;
}
