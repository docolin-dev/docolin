import { OG_COLORS as C } from "./palette";
import type { CardSpec } from "./types";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Satori consumes React-element-like objects ("VNodes"). We build them as plain
// objects so the project needs no React. This is the minimal shape Satori reads.
export interface OgNode {
  type: string;
  props: {
    style?: Record<string, string | number>;
    children?: OgChild | OgChild[];
  };
}
type OgChild = OgNode | string;

function el(
  type: string,
  style: Record<string, string | number>,
  children?: OgChild | OgChild[],
): OgNode {
  // Satori throws unless any element with more than one child sets an explicit
  // `display`. Default every box to flex (harmless for text and leaf boxes) so
  // no container can trip that rule; callers can still override.
  return { type, props: { style: { display: "flex", ...style }, children } };
}

// A run of text. Satori draws text inside any element; we keep it a flex box so
// its own style (weight, tracking) is unambiguous.
function text(content: string, style: Record<string, string | number>): OgNode {
  return el("div", { display: "flex", ...style }, content);
}

// Title size steps down as the title grows so a long headline still fits two
// lines in the 1072px content column instead of overflowing. Satori's
// multi-line clamp is unreliable across versions, so we also hard-cap the string
// and rely on `overflow: hidden` as a backstop.
function titleFontSize(title: string): number {
  const n = title.length;
  if (n <= 34) return 72;
  if (n <= 60) return 60;
  if (n <= 90) return 50;
  return 42;
}

function clampTitle(title: string): string {
  const MAX = 120;
  if (title.length <= MAX) return title;
  // Cut at the last word boundary before the cap so we never split a word.
  const slice = title.slice(0, MAX);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > 60 ? slice.slice(0, lastSpace) : slice;
  return `${base.trimEnd()}…`;
}

/** The Pango chip: "Pango 920" with the wordmark in rust, or "not verified yet"
 *  when the score is null. Returns null when the card hides the chip. */
function pangoChip(pango: number | null | undefined): OgNode | null {
  if (pango === undefined) return null;
  if (pango === null) {
    return text("not verified yet", { fontSize: 24, fontWeight: 500, color: C.mutedForeground });
  }
  return el("div", { display: "flex", alignItems: "center", gap: 8 }, [
    text("Pango", { fontSize: 24, fontWeight: 600, color: C.primary }),
    text(String(pango), { fontSize: 24, fontWeight: 600, color: C.foreground }),
  ]);
}

/** Outlined applies_to chips, hard-cornered (radius 0 is the brand), capped at
 *  three with a "+N" overflow so they never wrap into a second row. */
function appliesToChips(appliesTo: string[] | undefined): OgNode[] {
  if (appliesTo === undefined || appliesTo.length === 0) return [];
  const shown = appliesTo.slice(0, 3);
  const overflow = appliesTo.length - shown.length;
  const labels = overflow > 0 ? [...shown, `+${String(overflow)}`] : shown;
  return labels.map((label) =>
    text(label, {
      fontSize: 20,
      fontWeight: 500,
      color: C.mutedForeground,
      border: `1px solid ${C.border}`,
      padding: "6px 14px",
    }),
  );
}

/** Build the full card VNode from a resolved spec. Light surface, three bands:
 *  brand strip, title hero, meta strip. */
export function buildCard(spec: CardSpec): OgNode {
  const header = el(
    "div",
    { display: "flex", alignItems: "center", justifyContent: "space-between" },
    [
      // Wordmark: a hard-cornered rust square as the mark, then "docolin".
      el("div", { display: "flex", alignItems: "center", gap: 16 }, [
        el("div", { width: 30, height: 30, backgroundColor: C.primary }, []),
        text("docolin", {
          fontSize: 32,
          fontWeight: 600,
          color: C.foreground,
          letterSpacing: -0.5,
        }),
      ]),
      text(spec.eyebrow.toUpperCase(), {
        fontSize: 22,
        fontWeight: 500,
        color: C.mutedForeground,
        letterSpacing: 2,
      }),
    ],
  );

  const middleChildren: OgNode[] = [];
  if (spec.breadcrumb !== undefined && spec.breadcrumb.length > 0) {
    middleChildren.push(
      text(spec.breadcrumb.join("  ·  "), {
        fontSize: 24,
        fontWeight: 500,
        color: C.mutedForeground,
      }),
    );
  }
  middleChildren.push(
    text(clampTitle(spec.title), {
      fontSize: titleFontSize(spec.title),
      fontWeight: 600,
      color: C.foreground,
      lineHeight: 1.1,
      letterSpacing: -1,
      maxHeight: 260,
      overflow: "hidden",
    }),
  );
  const middle = el(
    "div",
    { display: "flex", flexDirection: "column", gap: 20, flex: 1, justifyContent: "center" },
    middleChildren,
  );

  // Meta strip: left = trust facets (Pango + applies_to, or a generic stat),
  // right = author. A hairline rule separates it from the title.
  const leftFacets: OgNode[] = [];
  const chip = pangoChip(spec.pango);
  if (chip !== null) leftFacets.push(chip);
  leftFacets.push(...appliesToChips(spec.appliesTo));
  if (leftFacets.length === 0 && spec.stat !== undefined) {
    leftFacets.push(text(spec.stat, { fontSize: 24, fontWeight: 500, color: C.mutedForeground }));
  }

  const footer = el(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: `1px solid ${C.border}`,
      paddingTop: 28,
    },
    [
      el("div", { display: "flex", alignItems: "center", gap: 16 }, leftFacets),
      spec.author !== undefined
        ? text(spec.author, { fontSize: 22, fontWeight: 500, color: C.mutedForeground })
        : el("div", { display: "flex" }, []),
    ],
  );

  return el(
    "div",
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      display: "flex",
      flexDirection: "column",
      backgroundColor: C.background,
      fontFamily: "Geist",
    },
    [
      // Rust top rule: the one accent block, brand tell.
      el("div", { width: OG_WIDTH, height: 10, backgroundColor: C.primary }, []),
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "56px 64px 52px 64px",
          justifyContent: "space-between",
        },
        [header, middle, footer],
      ),
    ],
  );
}
