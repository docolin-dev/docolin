import { visit } from "unist-util-visit";
import type { Root } from "hast";

// The pipeline's sanitization step. Author markdown reaches this tree with raw
// HTML already dropped (remark-rehype default) and attr-list limited to class +
// id, so the only XSS surfaces are dangerous URL schemes in links/images and,
// defensively, on* event-handler attributes. This pass neutralizes both on the
// HAST tree with no DOM, so it runs on Cloudflare Workers (unlike a DOMPurify
// pass, which needs a browser/jsdom). URL protocols are read via the platform
// URL parser, which normalizes obfuscation (casing, control chars, entities) the
// same way a browser would, rather than via a hand-rolled scheme match.

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
// blob: URLs come only from the local-folder preview (URL.createObjectURL on a
// picked file): same-origin and ephemeral. Allowed for media `src` so preview
// images render, but never for link `href`, so a doco can't smuggle one into a
// clickable link.
const SAFE_SRC_PROTOCOLS = new Set([...SAFE_PROTOCOLS, "blob:"]);
const URL_ATTRS = new Set(["href", "src"]);
// Relative/anchor URLs have no scheme; resolving them against a dummy https base
// yields an allowed protocol. The base host is never emitted.
const DUMMY_BASE = "https://docolin.invalid/";

function isSafeUrl(value: string, attr: string): boolean {
  try {
    const protocol = new URL(value, DUMMY_BASE).protocol;
    return (attr === "src" ? SAFE_SRC_PROTOCOLS : SAFE_PROTOCOLS).has(protocol);
  } catch {
    // Unparseable URL: drop it.
    return false;
  }
}

/** rehype: strip dangerous URL schemes from href/src and any on* event-handler
 *  attributes. Run last, before stringify. Removed attributes are set to
 *  undefined, which hast-util-to-html omits from the output. */
export function rehypeSanitizeUrls() {
  return (tree: Root): undefined => {
    visit(tree, "element", (node) => {
      const props = node.properties;
      for (const key of Object.keys(props)) {
        const lower = key.toLowerCase();
        if (lower.startsWith("on")) {
          props[key] = undefined;
          continue;
        }
        const value = props[key];
        if (URL_ATTRS.has(lower) && typeof value === "string" && !isSafeUrl(value, lower)) {
          props[key] = undefined;
        }
      }
    });
  };
}
