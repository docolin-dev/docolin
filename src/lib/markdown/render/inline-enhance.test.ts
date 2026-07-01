import { describe, it, expect } from "bun:test";
import { normalizeColor } from "./inline-enhance.ts";

// normalizeColor is the gate for the color-swatch feature: it decides what inline
// code becomes a swatch AND produces the value handed to the client as a CSS
// background, so it must accept real colors, preserve casing, and reject anything
// that could smuggle in non-color CSS (url(), nested functions, calc, prose).

describe("normalizeColor", () => {
  it("accepts hex colors of every valid length", () => {
    expect(normalizeColor("#fff")).toBe("#fff");
    expect(normalizeColor("#ffff")).toBe("#ffff");
    expect(normalizeColor("#76b900")).toBe("#76b900");
    expect(normalizeColor("#76b900ff")).toBe("#76b900ff");
  });

  it("preserves the author's exact casing", () => {
    expect(normalizeColor("#76B900")).toBe("#76B900");
  });

  it("rejects malformed hex", () => {
    expect(normalizeColor("#gg0011")).toBeNull(); // non-hex digit
    expect(normalizeColor("#12345")).toBeNull(); // 5 digits
    expect(normalizeColor("#")).toBeNull();
  });

  it("accepts functional colors (comma, space, and slash forms)", () => {
    expect(normalizeColor("rgb(118, 185, 0)")).toBe("rgb(118, 185, 0)");
    expect(normalizeColor("rgba(0 0 0 / 50%)")).toBe("rgba(0 0 0 / 50%)");
    expect(normalizeColor("hsl(90 100% 36%)")).toBe("hsl(90 100% 36%)");
    expect(normalizeColor("oklch(0.7 0.15 145)")).toBe("oklch(0.7 0.15 145)");
  });

  it("is case-insensitive on the function name", () => {
    expect(normalizeColor("RGB(1,2,3)")).toBe("RGB(1,2,3)");
  });

  it("rejects unknown or unsafe functions", () => {
    expect(normalizeColor("url(evil.png)")).toBeNull();
    expect(normalizeColor("calc(1px + 2px)")).toBeNull();
    expect(normalizeColor("rgb(1, url(x), 2)")).toBeNull(); // nested paren blocked
  });

  it("rejects plain words and empty input", () => {
    expect(normalizeColor("red")).toBeNull(); // named colors are ambiguous, skipped
    expect(normalizeColor("npm install")).toBeNull();
    expect(normalizeColor("")).toBeNull();
    expect(normalizeColor("   ")).toBeNull();
  });

  it("rejects an over-long string", () => {
    expect(normalizeColor(`rgb(${"9".repeat(80)})`)).toBeNull();
  });
});
