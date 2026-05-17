import { describe, it, expect } from "bun:test";
import { isLinkShaped } from "./link";

describe("isLinkShaped", () => {
  describe("accepts", () => {
    it("relative paths", () => {
      expect(isLinkShaped("./foo.md")).toBe(true);
      expect(isLinkShaped("../sibling/foo.md")).toBe(true);
    });

    it("absolute docolin paths", () => {
      expect(isLinkShaped("/org/project/path")).toBe(true);
      expect(isLinkShaped("/network/firewall/setup")).toBe(true);
    });

    it("https URLs", () => {
      expect(isLinkShaped("https://example.com")).toBe(true);
    });

    it("http URLs", () => {
      expect(isLinkShaped("http://example.com")).toBe(true);
    });

    it("mailto URLs", () => {
      expect(isLinkShaped("mailto:support@docolin.dev")).toBe(true);
    });

    it("tolerates leading and trailing whitespace", () => {
      expect(isLinkShaped("  ./foo.md  ")).toBe(true);
    });
  });

  describe("rejects", () => {
    it("empty and whitespace-only strings", () => {
      expect(isLinkShaped("")).toBe(false);
      expect(isLinkShaped("   ")).toBe(false);
    });

    it("bare filenames with no path indicator", () => {
      // No way to know whether "foo.md" is a relative path or a typo. Reject.
      expect(isLinkShaped("foo.md")).toBe(false);
    });

    it("anchor-only references", () => {
      // Anchors aren't useful as frontmatter links: they're in-page jumps.
      expect(isLinkShaped("#section")).toBe(false);
    });

    it("non-strings", () => {
      expect(isLinkShaped(null)).toBe(false);
      expect(isLinkShaped(undefined)).toBe(false);
      expect(isLinkShaped(42)).toBe(false);
      expect(isLinkShaped({})).toBe(false);
    });
  });
});
