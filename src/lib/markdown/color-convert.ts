// Color conversions for interactive variables: parse the big four formats
// (hex, rgb, hsl, oklch) into sRGB and emit any of them back. Pure,
// deterministic, bounded arithmetic, no new capability surface; the expression
// functions (tohex/torgb/tohsl/tooklch) and the color picker both build on it.
// OKLab <-> linear sRGB uses Bjorn Ottosson's reference matrices. String
// parsing is tokenizer-based (no regex, house rule). Formats normalizeColor
// accepts but this cannot parse (hwb, lab, lch, color()) make the conversion
// functions throw, which surfaces as an error chip.

/** sRGB in [0,1] channels + alpha. The exchange type between formats. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

// ---------- Parsing ----------

function hexNibble(ch: string): number | null {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "f") return ch.charCodeAt(0) - 87;
  if (ch >= "A" && ch <= "F") return ch.charCodeAt(0) - 55;
  return null;
}

function parseHex(value: string): Rgba | null {
  const digits = value.slice(1);
  const nibbles: number[] = [];
  for (const ch of digits) {
    const n = hexNibble(ch);
    if (n === null) return null;
    nibbles.push(n);
  }
  if (digits.length === 3 || digits.length === 4) {
    const [r, g, b] = nibbles;
    const alpha = digits.length === 4 ? (nibbles[3] * 17) / 255 : 1;
    return { r: (r * 17) / 255, g: (g * 17) / 255, b: (b * 17) / 255, alpha };
  }
  if (digits.length === 6 || digits.length === 8) {
    const byte = (i: number): number => nibbles[i] * 16 + nibbles[i + 1];
    return {
      r: byte(0) / 255,
      g: byte(2) / 255,
      b: byte(4) / 255,
      alpha: digits.length === 8 ? byte(6) / 255 : 1,
    };
  }
  return null;
}

// Splits a function's argument list on spaces, commas, and the alpha slash:
// "118, 185 0 / 50%" -> ["118", "185", "0", "/", "50%"].
function tokenizeArgs(args: string): string[] {
  const tokens: string[] = [];
  let current = "";
  for (const ch of args) {
    if (ch === " " || ch === ",") {
      if (current.length > 0) tokens.push(current);
      current = "";
      continue;
    }
    if (ch === "/") {
      if (current.length > 0) tokens.push(current);
      current = "";
      tokens.push("/");
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

// A numeric token with optional unit: "50%" -> percentage, "130deg" -> degrees.
function num(token: string, percentScale: number): number | null {
  let text = token;
  let scale = 1;
  if (text.endsWith("%")) {
    text = text.slice(0, -1);
    scale = percentScale / 100;
  } else if (text.endsWith("deg")) {
    text = text.slice(0, -3);
  }
  const value = Number(text);
  return Number.isFinite(value) ? value * scale : null;
}

function splitAlpha(tokens: string[]): { main: string[]; alpha: number } | null {
  const slash = tokens.indexOf("/");
  if (slash === -1) return { main: tokens, alpha: 1 };
  if (slash !== tokens.length - 2) return null;
  const alpha = num(tokens[tokens.length - 1], 1);
  if (alpha === null) return null;
  return { main: tokens.slice(0, slash), alpha: clamp01(alpha) };
}

function parseRgbFunction(args: string): Rgba | null {
  const parts = splitAlpha(tokenizeArgs(args));
  if (parts === null || parts.main.length < 3 || parts.main.length > 4) return null;
  const channels = parts.main.slice(0, 3).map((token) => num(token, 255));
  if (channels.some((c) => c === null)) return null;
  // A legacy 4th positional argument is the alpha.
  let alpha = parts.alpha;
  if (parts.main.length === 4) {
    const legacy = num(parts.main[3], 1);
    if (legacy === null) return null;
    alpha = clamp01(legacy);
  }
  const [r, g, b] = channels as number[];
  return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255), alpha };
}

function hslChannel(h: number, s: number, l: number, n: number): number {
  // CSS Color 4 reference conversion.
  const k = (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
}

function parseHslFunction(args: string): Rgba | null {
  const parts = splitAlpha(tokenizeArgs(args));
  if (parts === null || parts.main.length < 3 || parts.main.length > 4) return null;
  const h = num(parts.main[0], 360);
  const s = num(parts.main[1], 1);
  const l = num(parts.main[2], 1);
  if (h === null || s === null || l === null) return null;
  let alpha = parts.alpha;
  if (parts.main.length === 4) {
    const legacy = num(parts.main[3], 1);
    if (legacy === null) return null;
    alpha = clamp01(legacy);
  }
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const lig = clamp01(l);
  return {
    r: hslChannel(hue, sat, lig, 0),
    g: hslChannel(hue, sat, lig, 8),
    b: hslChannel(hue, sat, lig, 4),
    alpha,
  };
}

// ---------- OKLab / OKLCH (Ottosson reference transforms) ----------

/** sRGB transfer function, exported for WCAG luminance math (contrast()). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function rgbaToOklab(color: Rgba): { L: number; a: number; b: number } {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToRgba(L: number, a: number, b: number, alpha: number): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: clamp01(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp01(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    alpha,
  };
}

function parseOklchFunction(args: string): Rgba | null {
  const parts = splitAlpha(tokenizeArgs(args));
  if (parts?.main.length !== 3) return null;
  const L = num(parts.main[0], 1);
  const c = num(parts.main[1], 0.4); // percentage reference for chroma per spec
  const h = num(parts.main[2], 360);
  if (L === null || c === null || h === null) return null;
  const hue = (((h % 360) + 360) % 360) * (Math.PI / 180);
  return oklabToRgba(
    clamp01(L),
    Math.max(0, c) * Math.cos(hue),
    Math.max(0, c) * Math.sin(hue),
    parts.alpha,
  );
}

/** Parses hex / rgb() / hsl() / oklch() into sRGB. Null for anything else
 *  (including valid-but-unsupported formats like hwb/lab/color()). */
export function parseColor(text: string): Rgba | null {
  const value = text.trim();
  if (value.length === 0 || value.length > 64) return null;
  if (value.startsWith("#")) return parseHex(value);
  const open = value.indexOf("(");
  if (open === -1 || !value.endsWith(")")) return null;
  const fn = value.slice(0, open).toLowerCase();
  const args = value.slice(open + 1, value.length - 1);
  if (fn === "rgb" || fn === "rgba") return parseRgbFunction(args);
  if (fn === "hsl" || fn === "hsla") return parseHslFunction(args);
  if (fn === "oklch") return parseOklchFunction(args);
  return null;
}

// ---------- Emitting ----------

const to255 = (c: number): number => Math.round(clamp01(c) * 255);

function hexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function formatHex(color: Rgba): string {
  const base = `#${hexByte(to255(color.r))}${hexByte(to255(color.g))}${hexByte(to255(color.b))}`;
  return color.alpha < 1 ? `${base}${hexByte(to255(color.alpha))}` : base;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export function formatRgb(color: Rgba): string {
  const body = `${String(to255(color.r))} ${String(to255(color.g))} ${String(to255(color.b))}`;
  return color.alpha < 1 ? `rgb(${body} / ${String(round3(color.alpha))})` : `rgb(${body})`;
}

export function formatHsl(color: Rgba): string {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
    if (max === color.r) h = (color.g - color.b) / d + (color.g < color.b ? 6 : 0);
    else if (max === color.g) h = (color.b - color.r) / d + 2;
    else h = (color.r - color.g) / d + 4;
    h *= 60;
  }
  const body = `${String(round1(h))} ${String(round1(s * 100))}% ${String(round1(l * 100))}%`;
  return color.alpha < 1 ? `hsl(${body} / ${String(round3(color.alpha))})` : `hsl(${body})`;
}

export function formatOklch(color: Rgba): string {
  const { L, a, b } = rgbaToOklab(color);
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  // Achromatic colors have no meaningful hue; emit 0 for stability.
  if (c < 0.0001) h = 0;
  const body = `${String(round3(L))} ${String(round3(c))} ${String(round1(h))}`;
  return color.alpha < 1 ? `oklch(${body} / ${String(round3(color.alpha))})` : `oklch(${body})`;
}

export type ColorKind = "hex" | "rgb" | "hsl" | "oklch";

/** Which of the big four formats a (parseable) color string uses. */
export function colorKind(text: string): ColorKind | null {
  const value = text.trim().toLowerCase();
  if (value.startsWith("#")) return "hex";
  if (value.startsWith("rgb")) return "rgb";
  if (value.startsWith("hsl")) return "hsl";
  if (value.startsWith("oklch")) return "oklch";
  return null;
}

/** Emits `color` in the given format, so a manipulation (lighten, alpha, ...)
 *  hands back the same format family the author put in. */
export function formatAs(kind: ColorKind, color: Rgba): string {
  if (kind === "hex") return formatHex(color);
  if (kind === "rgb") return formatRgb(color);
  if (kind === "hsl") return formatHsl(color);
  return formatOklch(color);
}

// ---------- HSV (the picker's working model) ----------

// The classic picker geometry: a saturation/value square (CSS-paintable as a
// white + black gradient over the hue color) and a hue slider. HSV is only the
// UI's coordinate system; values still emit through the format functions above.

export interface Hsv {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

export function rgbaToHsv(color: Rgba): Hsv {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === color.r) h = ((color.g - color.b) / d) % 6;
    else if (max === color.g) h = (color.b - color.r) / d + 2;
    else h = (color.r - color.g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgba(hsv: Hsv, alpha: number): Rgba {
  const c = hsv.v * hsv.s;
  const x = c * (1 - Math.abs(((hsv.h / 60) % 2) - 1));
  const m = hsv.v - c;
  const sextant = (): [number, number, number] => {
    if (hsv.h < 60) return [c, x, 0];
    if (hsv.h < 120) return [x, c, 0];
    if (hsv.h < 180) return [0, c, x];
    if (hsv.h < 240) return [0, x, c];
    if (hsv.h < 300) return [x, 0, c];
    return [c, 0, x];
  };
  const [r, g, b] = sextant();
  return { r: r + m, g: g + m, b: b + m, alpha };
}

/** OKLCH components of a parsed color, for the picker's sliders. */
export function toOklchParts(color: Rgba): { l: number; c: number; h: number } {
  const { L, a, b } = rgbaToOklab(color);
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  if (c < 0.0001) h = 0;
  return { l: L, c, h };
}

/** Builds sRGB from OKLCH components (gamut-clamped), for the picker. */
export function fromOklchParts(l: number, c: number, h: number, alpha: number): Rgba {
  const hue = (((h % 360) + 360) % 360) * (Math.PI / 180);
  return oklabToRgba(
    clamp01(l),
    Math.max(0, c) * Math.cos(hue),
    Math.max(0, c) * Math.sin(hue),
    alpha,
  );
}
