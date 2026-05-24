import * as lucide from "lucide";
import { s } from "hastscript";
import type { Element } from "hast";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Info,
  Lightbulb,
  OctagonAlert,
  Pencil,
  Plus,
  TextSelect,
  TriangleAlert,
  Undo2,
} from "lucide";

// Lucide icons as hast (svg elements), shared by the render handlers (callout
// headers, collapsible/accordion chevrons, code-block buttons, card icons). We
// can't mount @lucide/svelte components into rendered HTML, so we serialize
// Lucide's icon-node data, mirroring its default attributes so the output matches
// the components used elsewhere in the app. iconHast covers a small, type-safe set
// the renderer uses internally; lucideIconHast resolves any Lucide name a doc
// author writes (cards, the :icon: shortcode). Authors' icons are server-rendered
// into the cached HTML, so readers never download Lucide.

// lucide doesn't export its IconNode type by a stable name, so derive it.
type LucideIcon = typeof Info;

const ICONS = {
  pencil: Pencil,
  info: Info,
  lightbulb: Lightbulb,
  "triangle-alert": TriangleAlert,
  "octagon-alert": OctagonAlert,
  "chevron-down": ChevronDown,
  copy: Copy,
  check: Check,
  plus: Plus,
  "text-select": TextSelect,
  "arrow-right": ArrowRight,
  "undo-2": Undo2,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

function buildSvg(node: LucideIcon, className: string): Element {
  const children = node.map(([tag, attrs]) => s(tag, attrs as Record<string, string | number>));
  return s(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      class: className,
      "aria-hidden": "true",
    },
    children,
  );
}

export function iconHast(name: IconName, className: string): Element {
  return buildSvg(ICONS[name], className);
}

// A kebab/spaced icon name to Lucide's PascalCase export key (book-open ->
// BookOpen). String ops only (no regex).
function pascalCase(name: string): string {
  let out = "";
  for (const part of name.trim().split("-")) {
    if (part.length === 0) continue;
    out += part[0].toUpperCase() + part.slice(1);
  }
  return out;
}

/** Resolves any Lucide icon name to an <svg>, or null if there is no such icon.
 *  For doc-author-supplied names (cards, the :icon: shortcode). */
export function lucideIconHast(name: string, className: string): Element | null {
  const registry = lucide as unknown as Record<string, LucideIcon | undefined>;
  const node = registry[pascalCase(name)];
  // Lucide also exports helpers (createIcons, ...); only icon-nodes are arrays.
  return Array.isArray(node) ? buildSvg(node, className) : null;
}
