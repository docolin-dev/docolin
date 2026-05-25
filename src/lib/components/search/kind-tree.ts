import type { KindFacetCount } from "./types";

// Builds the kind facet's nested tree from the flat (leaf-path, count) list the
// API returns. Each leaf count rolls up onto every ancestor, so a parent shows
// the total of its whole subtree, the way faceted browse trees are expected to.

export interface KindNode {
  /** Dotted ltree path up to and including this node, e.g. `hardware.gpu`. */
  path: string;
  /** Human-readable label for this segment. */
  label: string;
  /** Rolled-up count for this node and all descendants. */
  count: number;
  children: KindNode[];
}

// Turns an ltree segment (`steps_accordion`, `gpu`) into a display label. ltree
// labels use underscores where the display path uses hyphens; both become spaces
// and each word is capitalized.
export function labelForSegment(segment: string): string {
  const words = segment.replaceAll("_", " ").replaceAll("-", " ").split(" ");
  return words
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function buildKindTree(items: KindFacetCount[]): KindNode[] {
  const roots: KindNode[] = [];
  const byPath = new Map<string, KindNode>();

  const ensure = (path: string): KindNode => {
    const existing = byPath.get(path);
    if (existing !== undefined) return existing;
    const segments = path.split(".");
    const segment = segments[segments.length - 1];
    const node: KindNode = { path, label: labelForSegment(segment), count: 0, children: [] };
    byPath.set(path, node);
    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parent = ensure(segments.slice(0, -1).join("."));
      parent.children.push(node);
    }
    return node;
  };

  for (const item of items) {
    const segments = item.path.split(".");
    // Add this leaf's count to itself and every ancestor.
    for (let i = 1; i <= segments.length; i++) {
      ensure(segments.slice(0, i).join(".")).count += item.count;
    }
  }

  // Heaviest first at every level.
  const sortTree = (nodes: KindNode[]): void => {
    nodes.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    for (const node of nodes) sortTree(node.children);
  };
  sortTree(roots);

  return roots;
}

// Finds the node at an exact ltree path within a built tree, or null. Used by
// the kind browse page to render the children (the folder navigator) of the
// kind the reader is currently viewing.
export function findKindNode(roots: KindNode[], path: string): KindNode | null {
  const segments = path.split(".");
  let level = roots;
  let found: KindNode | null = null;
  for (let i = 0; i < segments.length; i++) {
    const wanted = segments.slice(0, i + 1).join(".");
    const node = level.find((n) => n.path === wanted);
    if (node === undefined) return null;
    found = node;
    level = node.children;
  }
  return found;
}
