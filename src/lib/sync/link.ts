// Link-shape validation for frontmatter fields (prev, next, superseded_by,
// sitemap entries). docolin accepts any link form: relative path, absolute
// docolin path (hard or soft URL), external URL, or mailto. No hard/soft
// distinction enforced at this layer; the renderer handles resolution.
//
// No regex per CLAUDE.md 3.8: prefix checks via startsWith are sufficient
// and easier to reason about for edge cases.

export function isLinkShaped(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = value.trim();
  if (t.length === 0) return false;
  if (t.startsWith("./") || t.startsWith("../")) return true;
  if (t.startsWith("/")) return true;
  if (t.startsWith("http://") || t.startsWith("https://")) return true;
  if (t.startsWith("mailto:")) return true;
  return false;
}
