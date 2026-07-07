// The OG card palette, in concrete hex. Satori (the HTML->SVG engine) cannot
// read CSS variables or oklch(), so the card cannot reference our theme tokens
// directly. These values are the sRGB conversions of the LIGHT-theme tokens in
// `src/routes/layout.css` (kept in sync by hand). OG images are a single fixed
// theme (a crawler can't tell us light vs dark), and we use the light surface
// because that is docolin's reading surface.
//
// If a token in layout.css changes, re-run the oklch->hex conversion and update
// the matching entry here.
export const OG_COLORS = {
  /** --background / --card: the card surface. */
  background: "#ffffff",
  /** --foreground: primary text (near-black warm stone). */
  foreground: "#0c0a09",
  /** --primary: the rust accent. */
  primary: "#bb4d00",
  /** --primary-foreground: text/!fill on rust (warm white). */
  primaryForeground: "#fffbeb",
  /** --muted: subtle warm-stone fill. */
  muted: "#f5f5f4",
  /** --muted-foreground: secondary text, breadcrumbs, chips. */
  mutedForeground: "#79716b",
  /** --border: hairlines and chip outlines. */
  border: "#e7e5e4",
} as const;
