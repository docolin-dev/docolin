import { h } from "hastscript";
import type { Element, ElementContent } from "hast";
import type { List, ListItem } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import type { State } from "mdast-util-to-hast";
import type { DocoTree } from "$lib/markdown/docomd";
import { iconHast } from "./icons.ts";

// Renders a docomd tree node (an unordered list promoted by `{ .tree }`) to its
// HTML: a bordered card holding a real nested <ul>/<li> structure styled as a
// file tree, fully server-rendered with no client JS. Keeping genuine list
// markup preserves the no-JS / SEO / a11y / AI reading: it is still just a
// nested list. The parsing side lives in docomd/tree.ts.
//
// Look: the whole tree is monospace, so inline-code names are UNWRAPPED (a code
// chip inside a tree is pure noise; with or without backticks a name renders
// the same). Folders read heavier than files (medium name + foreground icon vs
// muted icon), depth is drawn with guide lines, and a ` # ` in an entry starts
// a muted shell-style comment.

const ROOT_UL_CLASS = ["m-0", "list-none", "p-0"];
const NESTED_UL_CLASS = ["m-0", "list-none", "p-0", "ml-2", "border-l", "border-border", "pl-4"];
const ROW_CLASS = ["flex", "items-center", "gap-2", "py-1"];
const FOLDER_ICON_CLASS = "size-4 shrink-0 text-foreground";
const FILE_ICON_CLASS = "size-4 shrink-0 text-muted-foreground";

// Replaces inline <code> chips with their plain children; the tree is already
// monospace, so the chip border/background would only add noise.
function unwrapCode(nodes: ElementContent[]): ElementContent[] {
  const out: ElementContent[] = [];
  for (const node of nodes) {
    if (node.type === "element" && node.tagName === "code") {
      out.push(...node.children);
    } else {
      out.push(node);
    }
  }
  return out;
}

// Splits a ` # ` shell-style comment out of the name. The first text node
// carrying the separator is cut there; everything after it (including later
// inline nodes, so markdown keeps working in comments) moves to the returned
// comment array. Null when the entry has no comment.
function splitComment(name: ElementContent[]): ElementContent[] | null {
  for (let i = 0; i < name.length; i++) {
    const node = name[i];
    if (node.type !== "text") continue;
    const at = node.value.indexOf(" # ");
    if (at === -1) continue;
    const comment: ElementContent[] = [];
    const after = node.value.slice(at + 3).trimStart();
    if (after.length > 0) comment.push({ type: "text", value: after });
    comment.push(...name.splice(i + 1));
    const before = node.value.slice(0, at).trimEnd();
    if (before.length > 0) name[i] = { type: "text", value: before };
    else name.splice(i, 1);
    return comment;
  }
  return null;
}

// Drops one trailing `/` from the rendered name (the author's empty-folder
// marker); the folder icon already carries that meaning. Only the final text
// node is touched, so inline formatting stays intact.
function stripTrailingSlash(name: ElementContent[]): void {
  for (let i = name.length - 1; i >= 0; i--) {
    const node = name[i];
    if (node.type !== "text") continue;
    const trimmed = node.value.trimEnd();
    if (trimmed.endsWith("/")) node.value = trimmed.slice(0, -1);
    return;
  }
}

function renderItem(state: State, item: ListItem): Element {
  const sublists: List[] = [];
  let name: ElementContent[] = [];
  let rawText = "";
  for (const block of item.children) {
    if (block.type === "list") {
      sublists.push(block);
    } else if (block.type === "paragraph") {
      name.push(...state.all(block));
      rawText += mdastToString(block);
    }
  }
  name = unwrapCode(name);
  const comment = splitComment(name);

  // Folder detection runs on the name part only (before any ` # ` comment).
  const rawName = rawText.split(" # ")[0].trimEnd();
  const slashFolder = rawName.endsWith("/");
  const isFolder = sublists.length > 0 || slashFolder;
  if (slashFolder) stripTrailingSlash(name);

  const rowChildren: ElementContent[] = [
    iconHast(isFolder ? "folder" : "file", isFolder ? FOLDER_ICON_CLASS : FILE_ICON_CLASS),
    h("span", { class: isFolder ? ["font-medium", "text-foreground"] : ["text-foreground"] }, name),
  ];
  if (comment !== null && comment.length > 0) {
    rowChildren.push(
      h("span", { class: ["text-muted-foreground"] }, [{ type: "text", value: "# " }, ...comment]),
    );
  }

  const children: ElementContent[] = [h("span", { class: ROW_CLASS }, rowChildren)];
  for (const sublist of sublists) {
    children.push(
      h(
        "ul",
        { class: NESTED_UL_CLASS },
        sublist.children.map((child) => renderItem(state, child)),
      ),
    );
  }
  return h("li", children);
}

/** remark-rehype handler for {@link DocoTree}. */
export function treeHandler(state: State, node: DocoTree): Element {
  const list = node.children[0];
  return h(
    "figure",
    {
      class: [
        "doco-tree",
        "not-prose",
        "my-6",
        "border",
        "border-border",
        "bg-card",
        "p-4",
        "font-mono",
        "text-sm",
        // e.g. `annotate`, so `{ .tree .annotate }` gets annotation badges.
        ...node.extraClasses,
      ],
    },
    [
      h(
        "ul",
        { class: ROOT_UL_CLASS },
        list.children.map((item) => renderItem(state, item)),
      ),
    ],
  );
}
