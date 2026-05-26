import type { Element, ElementContent, Parent, Root, Text } from "hast";
import { h } from "hastscript";
import { SKIP, visit } from "unist-util-visit";
import { iconHast } from "./icons.ts";

// MkDocs-style annotations. A `(N)` marker plus an ordered list right after the block
// turns the marker into a small numbered badge; the list is hidden and revealed by
// clicking the badge (popover, wired in popovers.ts). Two ways to opt a block in:
//   - a code block (`.code-block`): markers go in the code, best inside a comment;
//   - any other block tagged `{ .annotate }` (-> `.annotate`): markers go in its text.
// Nesting works for free: an annotation list item can itself be `.annotate` with its
// own following list. A block is only converted when its markers line up with the
// list, so a stray `(1)` in real code/prose, or a normal list after a block, is left
// alone.

function hasClass(node: Element, name: string): boolean {
  const cls = node.properties.className;
  return Array.isArray(cls) && cls.includes(name);
}

function addClass(node: Element, name: string): void {
  const cls = node.properties.className;
  node.properties.className = Array.isArray(cls) ? [...cls, name] : [name];
}

// The next sibling element, skipping the whitespace text nodes remark-rehype inserts
// between blocks. Returns null if the next non-blank node isn't an element.
function nextElement(parent: Parent, index: number): Element | null {
  for (let i = index + 1; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (child.type === "element") return child;
    if (child.type === "text" && child.value.trim().length === 0) continue;
    return null;
  }
  return null;
}

function isSpace(char: string): boolean {
  return char === " " || char === "\t";
}

function trimEnd(text: string): string {
  let end = text.length;
  while (end > 0 && isSpace(text[end - 1])) end -= 1;
  return text.slice(0, end);
}

// For a `(N)!` marker, the `!` means "strip the comment", so the line shows only the
// badge. Drops a trailing comment delimiter (and its whitespace) from the text before
// the marker. Covers the common single-line delimiters.
function stripComment(before: string): string {
  let text = trimEnd(before);
  for (const delimiter of ["//", "--", "#", ";", "%"]) {
    if (text.endsWith(delimiter)) {
      text = text.slice(0, text.length - delimiter.length);
      break;
    }
  }
  return trimEnd(text);
}

// Reads a `(123)` or `(123)!` marker at the open paren. The trailing `!` requests
// comment stripping. Returns the number, whether to strip, and the index just past
// the marker, or null if it isn't a marker.
function readMarker(
  value: string,
  open: number,
): { value: number; end: number; strip: boolean } | null {
  let i = open + 1;
  let digits = "";
  while (i < value.length && value[i] >= "0" && value[i] <= "9") {
    digits += value[i];
    i += 1;
  }
  if (digits.length === 0 || value[i] !== ")") return null;
  i += 1;
  const strip = value[i] === "!";
  return { value: Number(digits), end: strip ? i + 1 : i, strip };
}

// Splits a text run into plain strings and marker numbers. A marker counts only when
// the `(` is at the start or follows whitespace (so `foo(1)` calls are skipped) and
// its number is within the annotation list. Returns null when there's no marker.
function splitMarkers(value: string, max: number): (string | number)[] | null {
  const out: (string | number)[] = [];
  let buffer = "";
  let i = 0;
  let found = false;
  while (i < value.length) {
    const char = value[i];
    if (char === "(") {
      const precededOk = buffer.length === 0 || isSpace(buffer[buffer.length - 1]);
      const marker = precededOk ? readMarker(value, i) : null;
      if (marker !== null && marker.value >= 1 && marker.value <= max) {
        const before = marker.strip ? stripComment(buffer) : buffer;
        if (before.length > 0) out.push(before);
        buffer = "";
        out.push(marker.value);
        i = marker.end;
        found = true;
        continue;
      }
    }
    buffer += char;
    i += 1;
  }
  if (!found) return null;
  if (buffer.length > 0) out.push(buffer);
  return out;
}

// All badges show a plus icon (a "click me" affordance); the number is internal,
// mapping the badge to its note in the hidden list.
function annotationButton(id: string, number: number): Element {
  return h(
    "button",
    {
      type: "button",
      class: ["code-annotation"],
      "data-annotation-ref": `${id}-${String(number)}`,
      "aria-label": `Annotation ${String(number)}`,
      "aria-expanded": "false",
    },
    [iconHast("plus", "size-3.5")],
  );
}

// Replaces every `(N)` marker in the block's text with a badge. Returns the set of
// numbers actually used. `skipInlineCode` ignores text inside inline <code> (so a
// literal `(1)` example in prose isn't a marker); code blocks pass false, since
// their markers live in the highlighted code.
function annotateMarkers(
  block: Element,
  id: string,
  max: number,
  skipInlineCode: boolean,
): Set<number> {
  const used = new Set<number>();
  visit(block, "text", (textNode: Text, index, parent) => {
    if (parent === undefined || index === undefined) return;
    if (skipInlineCode && parent.type === "element" && parent.tagName === "code") return;
    const segments = splitMarkers(textNode.value, max);
    if (segments === null) return;
    const replacement: ElementContent[] = segments.map((segment) => {
      if (typeof segment === "string") return { type: "text", value: segment };
      used.add(segment);
      return annotationButton(id, segment);
    });
    parent.children.splice(index, 1, ...replacement);
    return [SKIP, index + replacement.length];
  });
  return used;
}

/** rehype: turn `(N)` markers in a code block or `{ .annotate }` block (each with a
 *  following ordered list) into numbered badges, and hide the list as the popover
 *  source. Handles nested annotations via the same traversal. */
export function rehypeAnnotations() {
  return (tree: Root): undefined => {
    let block = 0;
    visit(tree, "element", (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      if (!hasClass(node, "code-block") && !hasClass(node, "annotate")) return;
      const list = nextElement(parent, index);
      if (list?.tagName !== "ol") return;

      const items = list.children.filter(
        (child): child is Element => child.type === "element" && child.tagName === "li",
      );
      if (items.length === 0) return;

      const id = `ca-${String(block)}`;
      const used = annotateMarkers(node, id, items.length, !hasClass(node, "code-block"));
      if (used.size === 0) return; // no real markers: leave the list as a normal list

      block += 1;
      // Hidden but in the DOM: revealed by clicking a badge (popover), and still read
      // by screen readers in document order. The badge is the visible affordance.
      addClass(list, "code-annotations");
      addClass(list, "sr-only");
      for (const [offset, item] of items.entries()) {
        item.properties.id = `${id}-${String(offset + 1)}`;
      }
    });
  };
}
