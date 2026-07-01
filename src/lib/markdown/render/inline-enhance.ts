import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { parseAttrs } from "../docomd/parse.ts";

// Two render-only inline enhancements:
//
//   1. A CSS color written as inline code (`#76b900`, `rgb(118 185 0)`, `oklch(…)`)
//      gets a swatch chip + click-to-copy.
//   2. Any inline code followed by a `{.copy}` attr-list becomes click-to-copy.
//
// Both are render-only: the underlying inline code round-trips through the sync
// canonicalize pipeline unchanged (a hex string / a plain marker), so nothing is
// added to the docomd syntax package or the stringify side.
//
// Color detection is strict and string-based (no regex), so prose like `red` or a
// variable name never turns into a swatch, and the value we hand the client as a
// background can only be a real, self-contained color literal (no `url(...)`, no
// nested functions), never author-controlled CSS.

const HEX_LENGTHS = new Set([3, 4, 6, 8]);
const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
]);
const MAX_COLOR_LENGTH = 64;

function isHexDigit(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

// Chars allowed inside a color function's parentheses: numbers, separators, and
// units / color-space keywords (deg, turn, none, srgb, …) which are plain letters.
// Excludes `(` and `)`, so a nested function such as `url(...)` can never appear.
function isFunctionArgChar(ch: string): boolean {
  if (ch >= "0" && ch <= "9") return true;
  if (ch >= "a" && ch <= "z") return true;
  if (ch >= "A" && ch <= "Z") return true;
  return (
    ch === " " || ch === "." || ch === "," || ch === "%" || ch === "/" || ch === "+" || ch === "-"
  );
}

/** Returns the color string if `text` is a supported CSS color literal, else null.
 *  Preserves the author's exact casing (the copy button copies what they wrote). */
export function normalizeColor(text: string): string | null {
  const value = text.trim();
  if (value.length === 0 || value.length > MAX_COLOR_LENGTH) return null;

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa.
  if (value.startsWith("#")) {
    const digits = value.slice(1);
    if (!HEX_LENGTHS.has(digits.length)) return null;
    for (const ch of digits) if (!isHexDigit(ch)) return null;
    return value;
  }

  // Functional: rgb()/hsl()/oklch()/… with a safe, self-contained argument list.
  const open = value.indexOf("(");
  if (open === -1 || !value.endsWith(")")) return null;
  const fn = value.slice(0, open).toLowerCase();
  if (!COLOR_FUNCTIONS.has(fn)) return null;
  const args = value.slice(open + 1, value.length - 1);
  if (args.length === 0) return null;
  for (const ch of args) if (!isFunctionArgChar(ch)) return null;
  return value;
}

/** Tags inline-code colors (swatch + copy) and `{.copy}`-marked inline code
 *  (copy). Registered in the render pipeline's remark phase. */
export function remarkInlineEnhance() {
  return (tree: Root): undefined => {
    visit(tree, "inlineCode", (node, index, parent) => {
      const classes: string[] = [];
      const extraProps: Record<string, string> = {};

      // An explicit `{.copy}` immediately after the inline code makes it copyable.
      if (parent !== undefined && index !== undefined) {
        const next = parent.children.at(index + 1);
        if (next?.type === "text") {
          const parsed = parseAttrs(next.value);
          if (parsed?.classes.includes("copy")) {
            classes.push("doco-copy");
            next.value = parsed.rest;
          }
        }
      }

      // Auto color swatch. Swatches copy their color value on click.
      const color = normalizeColor(node.value);
      if (color !== null) {
        classes.push("doco-swatch");
        if (!classes.includes("doco-copy")) classes.push("doco-copy");
        extraProps["data-color"] = color;
      }

      if (classes.length === 0) return;
      const data = node.data ?? (node.data = {});
      const props = data.hProperties ?? (data.hProperties = {});
      const existing = Array.isArray(props.className) ? props.className : [];
      props.className = [...existing, ...classes];
      Object.assign(props, extraProps);
    });
  };
}
