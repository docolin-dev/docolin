// Strict, string-based CSS-color validation (no regex), shared by the render-side
// inline swatches (inline-enhance) and the client-side variable chips (vars-impl).
// The value it returns can only ever be a real, self-contained color literal, no
// url(...), no nested functions, so it is safe to hand a browser as a background.

const HEX_LENGTHS = new Set([3, 4, 6, 8]);
const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
]);
const MAX_COLOR_LENGTH = 64;

function isHexDigit(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

// Chars allowed inside a color function's parentheses: numbers, separators, and
// units / color-space keywords (deg, turn, none, srgb, …) which are plain letters.
// Excludes `(` and `)`, so a nested function such as `url(...)` can never appear.
function isFunctionArgChar(ch: string): boolean {
  if (ch >= "0" && ch <= "9") return true;
  if (ch >= "a" && ch <= "z") return true;
  if (ch >= "A" && ch <= "Z") return true;
  return (
    ch === " " || ch === "." || ch === "," || ch === "%" || ch === "/" || ch === "+" || ch === "-"
  );
}

/** Returns the color string if `text` is a supported CSS color literal, else null.
 *  Preserves the author's exact casing (the copy button copies what they wrote). */
export function normalizeColor(text: string): string | null {
  const value = text.trim();
  if (value.length === 0 || value.length > MAX_COLOR_LENGTH) return null;

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa.
  if (value.startsWith("#")) {
    const digits = value.slice(1);
    if (!HEX_LENGTHS.has(digits.length)) return null;
    for (const ch of digits) if (!isHexDigit(ch)) return null;
    return value;
  }

  // Functional: rgb()/hsl()/oklch()/… with a safe, self-contained argument list.
  const open = value.indexOf("(");
  if (open === -1 || !value.endsWith(")")) return null;
  const fn = value.slice(0, open).toLowerCase();
  if (!COLOR_FUNCTIONS.has(fn)) return null;
  const args = value.slice(open + 1, value.length - 1);
  if (args.length === 0) return null;
  for (const ch of args) if (!isFunctionArgChar(ch)) return null;
  // A real color's arguments always carry at least one digit (30deg, 50%, 0.5);
  // bare keywords like rgb(red) or color(url) do not, and would render a broken
  // swatch, so they stay plain inline code.
  let hasDigit = false;
  for (const ch of args) if (ch >= "0" && ch <= "9") hasDigit = true;
  if (!hasDigit) return null;
  return value;
}
