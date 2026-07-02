import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { parseAttrs } from "../docomd/parse.ts";
import { normalizeColor } from "../color.ts";

// Two render-only inline enhancements:
//
//   1. A CSS color written as inline code (`#76b900`, `rgb(118 185 0)`, `oklch(…)`)
//      gets a swatch chip + click-to-copy.
//   2. Any inline code followed by a `{.copy}` attr-list becomes click-to-copy.
//
// Both are render-only: the underlying inline code round-trips through the sync
// canonicalize pipeline unchanged (a hex string / a plain marker), so nothing is
// added to the docomd syntax package or the stringify side. Color validation
// (normalizeColor) is the shared strict, string-based check in ../color.

export { normalizeColor } from "../color.ts";

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
