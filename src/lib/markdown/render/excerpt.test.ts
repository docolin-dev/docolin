import { describe, it, expect } from "bun:test";
import { extractExcerpt } from "./index.ts";

// extractExcerpt produces the meta description a doco ships to crawlers and
// social cards when its frontmatter has none, so its choices matter for SEO: it
// must pick the first real prose (not a heading or list), read as one line, and
// stay within the snippet budget without cutting a word in half.

describe("extractExcerpt", () => {
  it("returns the first paragraph as plain text", () => {
    expect(extractExcerpt("Install the driver, then reboot.")).toBe(
      "Install the driver, then reboot.",
    );
  });

  it("skips a leading heading and reads the first prose paragraph", () => {
    expect(extractExcerpt("# Install the driver\n\nRun the installer, then reboot.")).toBe(
      "Run the installer, then reboot.",
    );
  });

  it("strips inline markdown to plain text", () => {
    expect(extractExcerpt("Use **sudo** with the `apt` command and [see docs](https://x).")).toBe(
      "Use sudo with the apt command and see docs.",
    );
  });

  it("collapses soft line breaks into single spaces", () => {
    expect(extractExcerpt("first line\nsecond line")).toBe("first line second line");
  });

  it("truncates on a word boundary and appends an ellipsis", () => {
    const long = `${"word ".repeat(60).trim()}.`;
    const out = extractExcerpt(long);
    expect(out.length).toBeLessThanOrEqual(161); // 160-char budget + the ellipsis
    expect(out.endsWith("…")).toBe(true);
    expect(out.includes("wor…")).toBe(false); // never mid-word
  });

  it("returns empty string when the body opens with no paragraph", () => {
    expect(extractExcerpt("# Only a heading")).toBe("");
    expect(extractExcerpt("- a\n- list\n- only")).toBe("");
    expect(extractExcerpt("")).toBe("");
  });
});
