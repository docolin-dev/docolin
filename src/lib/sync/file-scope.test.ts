import { describe, it, expect } from "bun:test";
import { isDocoFile } from "./file-scope";

describe("isDocoFile", () => {
  describe("with no configured subpath", () => {
    it("accepts root .md files", () => {
      expect(isDocoFile("install.md", null)).toBe(true);
      expect(isDocoFile("install.md", "")).toBe(true);
    });

    it("accepts nested .md files", () => {
      expect(isDocoFile("guides/install.md", null)).toBe(true);
    });

    it("excludes README.md at repo root", () => {
      expect(isDocoFile("README.md", null)).toBe(false);
    });

    it("does NOT exclude README.md in subdirectories", () => {
      // Only the repo-root README is special. A docs/README.md is a
      // legitimate doc.
      expect(isDocoFile("docs/README.md", null)).toBe(true);
    });

    it("rejects non-markdown files", () => {
      expect(isDocoFile("config.json", null)).toBe(false);
      expect(isDocoFile("install.txt", null)).toBe(false);
    });

    it("is case-insensitive on the extension", () => {
      expect(isDocoFile("install.MD", null)).toBe(true);
    });
  });

  describe("with a configured subpath", () => {
    it("accepts files under the subpath", () => {
      expect(isDocoFile("docs/install.md", "docs")).toBe(true);
      expect(isDocoFile("docs/guides/install.md", "docs")).toBe(true);
    });

    it("accepts a subpath with trailing slash", () => {
      expect(isDocoFile("docs/install.md", "docs/")).toBe(true);
    });

    it("rejects files outside the subpath", () => {
      expect(isDocoFile("install.md", "docs")).toBe(false);
      expect(isDocoFile("guides/install.md", "docs")).toBe(false);
    });

    it("rejects prefix-as-substring matches", () => {
      // "docs2" must NOT match subpath "docs".
      expect(isDocoFile("docs2/install.md", "docs")).toBe(false);
    });
  });
});
