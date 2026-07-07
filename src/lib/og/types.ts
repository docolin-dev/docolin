/** The page kinds an OG card can represent. Drives the eyebrow label and which
 *  slots a mapper fills; the visual template is the same for all of them. */
export type OgPageType = "guide" | "topic" | "profile" | "discussion" | "search" | "page";

/** A resolved card, ready to render. Every page-type mapper produces one of
 *  these; the shared template (card.ts) turns it into pixels. All copy is
 *  final here (already localized, already formatted), because Satori draws it
 *  verbatim. */
export interface CardSpec {
  /** Small label top-right, e.g. "Guide", "Topic", "Discussion". */
  eyebrow: string;
  /** The hero line. Truncated to fit by the template. */
  title: string;
  /** Kind-path segments shown as a muted breadcrumb above the title. */
  breadcrumb?: string[];
  /** The Pango score: a number renders as "Pango <n>"; `null` renders
   *  "not verified yet"; omit entirely to hide the chip. */
  pango?: number | null;
  /** applies_to targets shown as outlined chips (e.g. "Ubuntu", "Fedora"). */
  appliesTo?: string[];
  /** Byline shown bottom-right, already formatted (e.g. "by @handle"). */
  author?: string;
  /** A generic bottom-left stat used when there is no Pango chip
   *  (e.g. "12 guides" on a topic card, or an echoed search query). */
  stat?: string;
}
