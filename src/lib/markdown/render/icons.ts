import { s } from "hastscript";
import type { Element } from "hast";
import {
  Check,
  ChevronDown,
  Copy,
  Info,
  Lightbulb,
  OctagonAlert,
  Pencil,
  TextSelect,
  TriangleAlert,
} from "lucide";

// Lucide icons as hast (svg elements), shared by the render handlers (callout
// headers, collapsible/accordion chevrons, the code-block copy button). We can't
// mount @lucide/svelte components into rendered HTML, so we serialize Lucide's
// icon-node data, mirroring its default attributes so the output matches the
// components used elsewhere in the app.

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
  "text-select": TextSelect,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function iconHast(name: IconName, className: string): Element {
  const children = ICONS[name].map(([tag, attrs]) =>
    s(tag, attrs as Record<string, string | number>),
  );
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
