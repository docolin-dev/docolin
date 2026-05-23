import { visit, SKIP } from "unist-util-visit";
import type { ElementContent, Root } from "hast";
import { lucideIconHast } from "./icons.ts";

// `:icon-name:` in body text becomes an inline Lucide icon sized to the
// surrounding text. Only a well-formed kebab name that resolves to a real Lucide
// icon is replaced; a stray colon, ":)", or "3:30" is left as text. Runs on the
// hast and skips <code>/<pre> so code samples keep their literal colons.

const ICON_CLASS = "inline-block size-[1em] align-[-0.125em]";

// A plausible icon name: lowercase letters, digits, and hyphens only (so a colon
// pair around prose like ":see this:" never matches). String ops, no regex.
function isIconCandidate(name: string): boolean {
  if (name.length === 0) return false;
  for (const char of name) {
    const ok = (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-";
    if (!ok) return false;
  }
  return true;
}

// Splits a text value into text + icon nodes. Returns null if nothing matched, so
// the caller can leave the original node untouched.
function replaceIcons(value: string): ElementContent[] | null {
  const out: ElementContent[] = [];
  let buffer = "";
  let replaced = false;
  let i = 0;
  while (i < value.length) {
    if (value[i] === ":") {
      const close = value.indexOf(":", i + 1);
      if (close !== -1) {
        const name = value.slice(i + 1, close);
        const icon = isIconCandidate(name) ? lucideIconHast(name, ICON_CLASS) : null;
        if (icon !== null) {
          if (buffer.length > 0) {
            out.push({ type: "text", value: buffer });
            buffer = "";
          }
          out.push(icon);
          replaced = true;
          i = close + 1;
          continue;
        }
      }
    }
    buffer += value[i];
    i += 1;
  }
  if (buffer.length > 0) out.push({ type: "text", value: buffer });
  return replaced ? out : null;
}

/** rehype pass: expand `:icon-name:` shortcodes to inline Lucide icons. */
export function rehypeIconShortcodes() {
  return (tree: Root): undefined => {
    visit(tree, (node, index, parent) => {
      if (node.type === "element" && (node.tagName === "code" || node.tagName === "pre")) {
        return SKIP; // leave colons in code samples alone
      }
      if (node.type !== "text" || parent === undefined || index === undefined) return;
      if (!node.value.includes(":")) return;
      const parts = replaceIcons(node.value);
      if (parts === null) return;
      parent.children.splice(index, 1, ...parts);
      return index + parts.length; // resume after the inserted nodes
    });
  };
}
