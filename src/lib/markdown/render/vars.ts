import { h } from "hastscript";
import type { Element, ElementContent, Properties } from "hast";
import type { Root as MdastRoot, PhrasingContent } from "mdast";
import type { VFile } from "vfile";
import { visit, SKIP } from "unist-util-visit";
import { m } from "$paraglide/messages";
import { locales, type Locale } from "$paraglide/runtime";
import { dedentBody, type Admonition } from "$lib/markdown/docomd";
import { parseDeclarations, type VarDeclaration } from "$lib/markdown/inputs";
import { expressionIdentifiers } from "$lib/markdown/expr";

// Render-side of interactive variables (docomd `!!! inputs` + `{{ expr }}`).
// One remark pass owns the whole feature so its rules stay in one place:
//
//   1. Parse every `!!! inputs` card's declaration lines. Lines are sliced RAW
//      from the source (expressions contain `*`/`_` that markdown parsing would
//      eat as emphasis); the admonition body was re-parsed from its dedented
//      slice, so child positions index into dedentBody(raw admonition span).
//   2. Tag `{{ expr }}` sites in prose text, but ONLY expressions whose whole
//      AST is evaluable and whose identifiers are all declared. Everything else
//      (Helm's `{{ .Values.x }}`, Jinja filters, undeclared names) stays
//      literal text, so docs about template languages survive untouched.
//   3. Annotate code nodes with the declared names, unless the fence opts out
//      with `novars`; code.ts splices the markers after highlighting (a `{{ }}`
//      can span shiki tokens, so it cannot be a text replacement).
//
// Values never render on the server: the page HTML is identical for every
// reader (cache-first), markers carry only the expression, and the client
// (src/lib/markdown/vars.ts) mounts the card and fills the chips.

export interface InputsCardData {
  title: string;
  declarations: VarDeclaration[];
  problems: string[];
  /** The DOCO's language (not the reader's locale): prerendered fallback strings
   *  localize to the content, since the HTML is cached identically for everyone. */
  language: string;
}

// Keyed by the mdast node, same pattern as code.ts's builtBlocks: unique per
// render, garbage-collected with the tree.
const cards = new WeakMap<Admonition, InputsCardData>();

interface Positioned {
  position?: { start: { offset?: number }; end: { offset?: number } };
}

function rawSlice(source: string, node: Positioned): string | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  return source.slice(start, end);
}

// The declaration text of one list item: its first raw line, bullet stripped.
function declarationLine(itemRaw: string): string {
  const firstLine = itemRaw.split("\n")[0].trimStart();
  if (firstLine.startsWith("- ") || firstLine.startsWith("* ") || firstLine.startsWith("+ ")) {
    return firstLine.slice(2);
  }
  return firstLine;
}

function parseCard(node: Admonition, source: string, language: string): InputsCardData {
  const problems: string[] = [];
  const raw = rawSlice(source, node as Positioned);
  if (raw === null) {
    return {
      title: node.title,
      declarations: [],
      problems: ["inputs card has no source span"],
      language,
    };
  }
  // Reconstruct the exact string the admonition body was re-parsed from, so the
  // children's positions index into it.
  const body = dedentBody(raw);
  const lines: string[] = [];
  for (const child of node.children) {
    if (child.type !== "list") {
      problems.push("an inputs card holds only a list of declarations");
      continue;
    }
    for (const item of child.children) {
      const itemRaw = rawSlice(body, item);
      if (itemRaw === null) continue;
      lines.push(declarationLine(itemRaw));
    }
  }
  const parsed = parseDeclarations(lines);
  return {
    title: node.title,
    declarations: parsed.declarations,
    problems: [...problems, ...parsed.problems],
    language,
  };
}

// ---------- `{{ expr }}` candidates ----------

interface VarSite {
  /** The expression between the braces, trimmed. */
  expr: string;
  /** [start, end) of the whole `{{ ... }}` in the scanned text. */
  start: number;
  end: number;
}

/** Finds the substitutable `{{ expr }}` ranges in `text`: parseable within the
 *  expression grammar AND every identifier declared. Anything else is left for
 *  the surrounding text to keep literally. */
export function findVarSites(text: string, declared: ReadonlySet<string>): VarSite[] {
  const sites: VarSite[] = [];
  let from = 0;
  while (from < text.length) {
    const open = text.indexOf("{{", from);
    if (open === -1) break;
    const close = text.indexOf("}}", open + 2);
    if (close === -1) break;
    const expr = text.slice(open + 2, close).trim();
    const identifiers = expr.length === 0 ? null : expressionIdentifiers(expr);
    if (identifiers?.every((name) => declared.has(name)) === true) {
      sites.push({ expr, start: open, end: close + 2 });
    }
    from = close + 2;
  }
  return sites;
}

/** The marker element for one substitution site. The raw `{{ ... }}` text stays
 *  as the fallback content (agents and no-JS readers see the convention); the
 *  client swaps in the live value. */
function varMarker(expr: string, raw: string): Element {
  return h("span", { class: ["doco-var"], "data-expr": expr }, raw);
}

// ---------- Code lines (post-highlight splice) ----------

// A leaf text run inside a highlighted line: its text plus the span properties
// it was wrapped in (null for bare text, e.g. the un-highlighted fallback).
interface Leaf {
  text: string;
  props: Properties | null;
}

function lineLeaves(line: Element): Leaf[] {
  const leaves: Leaf[] = [];
  for (const child of line.children) {
    if (child.type === "text") {
      leaves.push({ text: child.value, props: null });
    } else if (child.type === "element") {
      for (const inner of child.children) {
        if (inner.type === "text") leaves.push({ text: inner.value, props: child.properties });
      }
    }
  }
  return leaves;
}

function leafPart(leaf: Leaf, text: string): ElementContent {
  if (text.length === 0) return { type: "text", value: "" };
  if (leaf.props === null) return { type: "text", value: text };
  return {
    type: "element",
    tagName: "span",
    properties: { ...leaf.props },
    children: [{ type: "text", value: text }],
  };
}

/** Splices `{{ expr }}` markers into one highlighted code line, preserving the
 *  shiki span colors of everything around them. A site can span several tokens;
 *  its own text renders unstyled inside the marker (values are reader-supplied
 *  text, not code to colorize). */
export function injectLineVars(line: Element, declared: ReadonlySet<string>): void {
  const leaves = lineLeaves(line);
  const text = leaves.map((leaf) => leaf.text).join("");
  const sites = findVarSites(text, declared);
  if (sites.length === 0) return;

  const out: ElementContent[] = [];
  let site = 0;
  let markerText = "";
  let cursor = 0;
  for (const leaf of leaves) {
    let local = 0;
    while (local < leaf.text.length) {
      const abs = cursor + local;
      const current = sites[site] as VarSite | undefined;
      if (current === undefined || abs < current.start) {
        // Outside any site: keep up to the next site start (or leaf end).
        const until = Math.min(leaf.text.length, (current?.start ?? Infinity) - cursor);
        const part = leaf.text.slice(local, until);
        if (part.length > 0) out.push(leafPart(leaf, part));
        local = until;
        continue;
      }
      // Inside the current site: accumulate up to its end.
      const until = Math.min(leaf.text.length, current.end - cursor);
      markerText += leaf.text.slice(local, until);
      local = until;
      if (cursor + local >= current.end) {
        out.push(varMarker(current.expr, markerText));
        markerText = "";
        site += 1;
      }
    }
    cursor += leaf.text.length;
  }
  line.children = out;
}

// ---------- The remark plugin ----------

/** remark plugin: parses `!!! inputs` cards, tags prose `{{ expr }}` sites, and
 *  annotates code nodes with the declared names for code.ts. Must run before
 *  remarkCode (code blocks read the annotation while being built). */
export function remarkVars() {
  return (tree: MdastRoot, file: VFile): undefined => {
    const source = String(file.value);
    const language = typeof file.data.docoLanguage === "string" ? file.data.docoLanguage : "en";
    const declared = new Set<string>();

    // Pass 1: every card, wherever it nests, in document order (a later card's
    // names substitute in earlier prose too: names are doc-scoped, placement is
    // presentation). Admonition and tab bodies are RE-PARSED from their dedented
    // slice, so children's positions index into that body string, not the
    // document; the walk carries the correct source space down each level (a
    // card inside a Rendered box or a tab still slices its true raw lines).
    interface WalkNode {
      type: string;
      children?: WalkNode[];
    }
    const collectCards = (nodes: readonly WalkNode[], space: string): void => {
      for (const node of nodes) {
        if (node.type === "admonition" || node.type === "docoTab") {
          if (node.type === "admonition") {
            const admonition = node as unknown as Admonition;
            if (admonition.atype === "inputs") {
              const card = parseCard(admonition, space, language);
              // Names are doc-scoped: a name already declared by an earlier card
              // is dropped here and reported, so "first wins" is never silent.
              card.declarations = card.declarations.filter((decl) => {
                if (!declared.has(decl.name)) return true;
                card.problems.push(
                  `variable "${decl.name}" is already declared in another inputs card (the first wins)`,
                );
                return false;
              });
              cards.set(admonition, card);
              for (const decl of card.declarations) declared.add(decl.name);
            }
          }
          const raw = rawSlice(space, node as Positioned);
          if (node.children !== undefined) {
            collectCards(node.children, raw === null ? "" : dedentBody(raw));
          }
          continue;
        }
        if (node.children !== undefined) collectCards(node.children, space);
      }
    };
    collectCards(tree.children, source);
    if (declared.size === 0) return undefined;

    // Pass 2: prose text. Skip inputs cards themselves (their children are
    // replaced by the form) and keep everything non-substitutable literal.
    visit(tree, (node, index, parent) => {
      if (node.type === "admonition" && node.atype === "inputs") return SKIP;
      if (node.type !== "text" || parent === undefined || index === undefined) return;
      const sites = findVarSites(node.value, declared);
      if (sites.length === 0) return;
      const parts: PhrasingContent[] = [];
      let cursor = 0;
      for (const site of sites) {
        if (site.start > cursor)
          parts.push({ type: "text", value: node.value.slice(cursor, site.start) });
        parts.push({
          type: "text",
          value: node.value.slice(site.start, site.end),
          data: {
            hName: "span",
            hProperties: { className: ["doco-var"], "data-expr": site.expr },
          },
        });
        cursor = site.end;
      }
      if (cursor < node.value.length) parts.push({ type: "text", value: node.value.slice(cursor) });
      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });

    // Pass 3: code fences carry the declared names for the post-highlight
    // splice, unless the author opted the block out with `novars`.
    visit(tree, "code", (node) => {
      if (node.meta?.includes("novars") === true) return;
      const data = node.data ?? (node.data = {});
      (data as { docoVarNames?: string[] }).docoVarNames = [...declared];
    });
    return undefined;
  };
}

/** The parsed card for an admonition node, if remarkVars saw it. */
export function inputsCard(node: Admonition): InputsCardData | undefined {
  return cards.get(node);
}

// ---------- The card's HTML (server-static; the client mounts the real form) ----------

// Prerendered strings localize to the doco's language (unknown languages fall
// back to English); the reader's own locale only drives the client-mounted form.
function docoLocale(language: string): Locale {
  return (locales as readonly string[]).includes(language) ? (language as Locale) : "en";
}

/** Renders an inputs card: a bordered panel with the title bar, a canvas the
 *  client mounts the Svelte form into (shadcn inputs), and a static fallback
 *  list (what agents, no-JS readers, and the pre-mount flash see). The full
 *  declaration set rides in a data attribute as JSON for the client. */
export function renderInputsCard(card: InputsCardData): Element {
  const locale = docoLocale(card.language);
  const title = card.title.length > 0 ? card.title : m.doco_inputs_fallback_title({}, { locale });
  const inputs = card.declarations.filter((decl) => decl.kind === "input");
  const computed = card.declarations.filter((decl) => decl.kind === "computed");

  const fallbackRows: ElementContent[] = inputs.map((decl) =>
    h("li", { class: ["py-0.5"] }, [
      h("span", { class: ["font-medium"] }, decl.label),
      h("span", { class: ["text-muted-foreground"] }, [": "]),
      h("code", `{{ ${decl.name} }}`),
    ]),
  );

  return h(
    "div",
    {
      class: ["doco-inputs", "not-prose", "my-6", "border", "border-border"],
      "data-doco-inputs": "",
      "data-inputs-card": JSON.stringify({
        declarations: card.declarations,
        problems: card.problems,
      }),
    },
    [
      h(
        "div",
        {
          class: [
            "doco-inputs-title",
            "border-b",
            "border-border",
            "bg-muted",
            "px-3",
            "py-1.5",
            "text-xs",
            "font-medium",
            "text-foreground",
          ],
        },
        title,
      ),
      h("div", { class: ["doco-inputs-canvas"] }),
      h("div", { class: ["doco-inputs-fallback", "px-4", "py-3", "text-sm"] }, [
        h("ul", { class: ["list-none"] }, fallbackRows),
        ...(computed.length > 0
          ? [
              h(
                "p",
                { class: ["text-muted-foreground", "mt-2", "text-xs"] },
                m.doco_inputs_fallback_derived(
                  { names: computed.map((decl) => decl.name).join(", ") },
                  { locale },
                ),
              ),
            ]
          : []),
      ]),
    ],
  );
}
