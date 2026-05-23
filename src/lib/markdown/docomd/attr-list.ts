import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { parseAttrs } from "./parse.ts";

// MkDocs-style attribute lists for links: `[label](url){ .class #id }`. This
// powers buttons (`{ .md-button .md-button--primary }`); the same `{ ... }` syntax
// also carries card props (`{ icon=... type=... }`), but those are read by the
// card renderer, so here we only act on a list that has classes or an id and leave
// a props-only list untouched. Parsing (parseAttrs) is string-based, no regex.

/** Attaches a trailing `{ .class #id }` attribute list to the preceding link. */
export function remarkAttrList() {
  return (tree: Root): undefined => {
    visit(tree, "link", (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      const next = parent.children.at(index + 1);
      if (next?.type !== "text") return;
      const parsed = parseAttrs(next.value);
      // Leave a props-only list (e.g. a card's { icon=... }) for the card renderer.
      if (parsed === null || (parsed.classes.length === 0 && parsed.id === null)) return;

      const data = node.data ?? (node.data = {});
      const props = data.hProperties ?? (data.hProperties = {});
      const existing = Array.isArray(props.className) ? props.className : [];
      props.className = [...existing, ...parsed.classes];
      if (parsed.id !== null) props.id = parsed.id;
      next.value = parsed.rest;
    });
  };
}
