import * as lucide from "lucide";
import { fas } from "@fortawesome/free-solid-svg-icons";
import { far } from "@fortawesome/free-regular-svg-icons";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { s } from "hastscript";
import type { Element } from "hast";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Info,
  Lightbulb,
  Link,
  OctagonAlert,
  Pencil,
  Play,
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
  link: Link,
  "triangle-alert": TriangleAlert,
  "octagon-alert": OctagonAlert,
  "chevron-down": ChevronDown,
  copy: Copy,
  check: Check,
  play: Play,
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

// ---------- Font Awesome (free) ----------

// We bundle the free Font Awesome regular (outline), solid (filled), and brands
// packs. Mintlify renders the regular/outline style by default, so resolution
// prefers regular, then falls back to solid; brands covers logos like GitHub.

interface FaDef {
  iconName: string;
  icon: [number, number, unknown, unknown, string | string[]];
}

type FaPack = "regular" | "solid" | "brands";

let faRegular: Map<string, FaDef> | null = null;
let faSolid: Map<string, FaDef> | null = null;
let faBrands: Map<string, FaDef> | null = null;

function buildFaMap(src: unknown): Map<string, FaDef> {
  const map = new Map<string, FaDef>();
  for (const def of Object.values(src as Record<string, FaDef>)) {
    if (typeof def.iconName === "string" && !map.has(def.iconName)) map.set(def.iconName, def);
  }
  return map;
}

function faPackMap(pack: FaPack): Map<string, FaDef> {
  if (pack === "regular") return (faRegular ??= buildFaMap(far));
  if (pack === "solid") return (faSolid ??= buildFaMap(fas));
  return (faBrands ??= buildFaMap(fab));
}

/** Resolves a Font Awesome (free) icon name to an <svg>, or null. FA icons are
 *  filled (currentColor), unlike Lucide's stroked nodes. */
export function faIconHast(name: string, pack: FaPack, className: string): Element | null {
  const def = faPackMap(pack).get(name);
  if (def === undefined) return null;
  const [width, height, , , pathData] = def.icon;
  const d = Array.isArray(pathData) ? pathData[pathData.length - 1] : pathData;
  return s(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${String(width)} ${String(height)}`,
      fill: "currentColor",
      class: className,
      "aria-hidden": "true",
    },
    [s("path", { d })],
  );
}

// ---------- multi-set resolution ----------

type IconSet = "lucide" | "fontawesome" | "tabler";

type IconSource = "lucide" | "fa-regular" | "fa-solid" | "fa-brands";

// Resolution sources for an icon, by its set. A Font Awesome icon prefers FA:
// regular (outline), then solid (filled), then brands (logos), and only as a LAST
// resort Lucide, since Mintlify uses many FA Pro names we can't bundle (e.g.
// `sparkles`) and Lucide overlaps heavily, better a Lucide glyph than none. A
// Lucide icon stays in Lucide. A bare name (docolin's default) is Lucide-first
// with FA as the fallback. Tabler isn't bundled, so it resolves like an fa- name.
function sourceOrder(set: IconSet | null): IconSource[] {
  if (set === "fontawesome" || set === "tabler") {
    return ["fa-regular", "fa-solid", "fa-brands", "lucide"];
  }
  if (set === "lucide") return ["lucide"];
  return ["lucide", "fa-regular", "fa-solid", "fa-brands"];
}

function iconFromSource(source: IconSource, name: string, className: string): Element | null {
  if (source === "lucide") return lucideIconHast(name, className);
  if (source === "fa-regular") return faIconHast(name, "regular", className);
  if (source === "fa-brands") return faIconHast(name, "brands", className);
  return faIconHast(name, "solid", className);
}

// An icon name may carry a short set prefix joined by a hyphen: `fa-plug` (Font
// Awesome), `tb-plug` (Tabler), `lu-plug` (Lucide). A bare name has no explicit
// set. A hyphen is used (not a colon) so the prefix also works inside the inline
// `:name:` shortcode; no real icon name's first segment is fa/tb/lu (a single
// letter would collide, e.g. `t-shirt`). The Mintlify converter rewrites names
// with its configured library's prefix; docolin authors can use it too.
function setForPrefix(prefix: string): IconSet | null {
  if (prefix === "fa") return "fontawesome";
  if (prefix === "tb") return "tabler";
  if (prefix === "lu") return "lucide";
  return null;
}

function parseIconRef(raw: string): { set: IconSet | null; name: string } {
  const hyphen = raw.indexOf("-");
  if (hyphen === -1) return { set: null, name: raw };
  const set = setForPrefix(raw.slice(0, hyphen));
  return set === null ? { set: null, name: raw } : { set, name: raw.slice(hyphen + 1) };
}

/** Resolves an author icon name (optionally `set-name`, e.g. `fa-plug`) to an
 *  <svg>, or null. Outline sources win (matching Mintlify's look); the set prefix
 *  only chooses whether FA's outline leads over Lucide's. */
export function resolveIconHast(rawName: string, className: string): Element | null {
  const { set, name } = parseIconRef(rawName);
  for (const source of sourceOrder(set)) {
    const el = iconFromSource(source, name, className);
    if (el !== null) return el;
  }
  return null;
}
