import { describe, it, expect } from "bun:test";
import { parseColor, formatHex, formatRgb, formatHsl, formatOklch } from "./color-convert.ts";

function hexOf(input: string): string {
  const color = parseColor(input);
  if (color === null) throw new Error(`expected ${input} to parse`);
  return formatHex(color);
}

describe("parseColor", () => {
  it("parses the hex family", () => {
    expect(parseColor("#76b900")).toMatchObject({ alpha: 1 });
    expect(hexOf("#7b0")).toBe("#77bb00");
    expect(hexOf("#76b900ff")).toBe("#76b900");
    expect(hexOf("#76b90080")).toBe("#76b90080");
  });

  it("parses rgb in modern and legacy notations", () => {
    expect(hexOf("rgb(118 185 0)")).toBe("#76b900");
    expect(hexOf("rgb(118, 185, 0)")).toBe("#76b900");
    expect(hexOf("rgba(118, 185, 0, 0.5)")).toBe("#76b90080");
    expect(hexOf("rgb(118 185 0 / 50%)")).toBe("#76b90080");
  });

  it("parses hsl", () => {
    expect(hexOf("hsl(0 100% 50%)")).toBe("#ff0000");
    expect(hexOf("hsl(120deg 100% 25%)")).toBe("#008000");
  });

  it("parses oklch back to a close sRGB", () => {
    const color = parseColor("oklch(0.627955 0.257683 29.2339)"); // sRGB red
    expect(color).not.toBeNull();
    if (color !== null) {
      expect(Math.round(color.r * 255)).toBe(255);
      expect(Math.round(color.g * 255)).toBeLessThanOrEqual(1);
      expect(Math.round(color.b * 255)).toBeLessThanOrEqual(1);
    }
  });

  it("returns null for unsupported or malformed input", () => {
    expect(parseColor("hwb(120 0% 0%)")).toBeNull(); // valid CSS, unsupported here
    expect(parseColor("red")).toBeNull();
    expect(parseColor("rgb(a b c)")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
  });
});

describe("format round trips", () => {
  const samples = ["#76b900", "#1a2b3c", "#ffffff", "#000000", "#d97706"];

  it("hex -> rgb -> hex is stable", () => {
    for (const hex of samples) {
      expect(hexOf(formatRgb(parseColor(hex) ?? { r: 0, g: 0, b: 0, alpha: 1 }))).toBe(hex);
    }
  });

  it("hex -> hsl -> hex is stable within rounding", () => {
    for (const hex of samples) {
      const back = parseColor(formatHsl(parseColor(hex) ?? { r: 0, g: 0, b: 0, alpha: 1 }));
      expect(back).not.toBeNull();
      const original = parseColor(hex);
      if (back !== null && original !== null) {
        expect(Math.abs(back.r - original.r)).toBeLessThan(0.01);
        expect(Math.abs(back.g - original.g)).toBeLessThan(0.01);
        expect(Math.abs(back.b - original.b)).toBeLessThan(0.01);
      }
    }
  });

  it("hex -> oklch -> hex is stable within rounding", () => {
    for (const hex of samples) {
      const back = parseColor(formatOklch(parseColor(hex) ?? { r: 0, g: 0, b: 0, alpha: 1 }));
      expect(back).not.toBeNull();
      const original = parseColor(hex);
      if (back !== null && original !== null) {
        expect(Math.abs(back.r - original.r)).toBeLessThan(0.02);
        expect(Math.abs(back.g - original.g)).toBeLessThan(0.02);
        expect(Math.abs(back.b - original.b)).toBeLessThan(0.02);
      }
    }
  });
});
