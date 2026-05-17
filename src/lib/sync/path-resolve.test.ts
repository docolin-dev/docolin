import { describe, it, expect } from "bun:test";
import { resolveRelativePath, isRelativePath } from "./path-resolve";

describe("resolveRelativePath", () => {
  it("resolves a same-directory reference", () => {
    expect(resolveRelativePath("docs/install.md", "./images/foo.png")).toBe("docs/images/foo.png");
  });

  it("resolves a parent-directory reference", () => {
    expect(resolveRelativePath("docs/guides/install.md", "../images/foo.png")).toBe(
      "docs/images/foo.png",
    );
  });

  it("resolves multiple parent hops", () => {
    expect(resolveRelativePath("a/b/c/d.md", "../../../top.md")).toBe("top.md");
  });

  it("handles a base path at repo root", () => {
    expect(resolveRelativePath("README.md", "./foo.md")).toBe("foo.md");
  });

  it("handles bare relative paths (no leading ./)", () => {
    expect(resolveRelativePath("docs/install.md", "images/foo.png")).toBe("docs/images/foo.png");
  });

  it("collapses leading dots and slashes cleanly", () => {
    expect(resolveRelativePath("docs/install.md", "./././images/foo.png")).toBe(
      "docs/images/foo.png",
    );
  });

  it("does not pop above the root", () => {
    // Going above repo root is meaningless; the resolver clamps at empty.
    expect(resolveRelativePath("a.md", "../../foo.md")).toBe("foo.md");
  });
});

describe("isRelativePath", () => {
  it("treats ./ and ../ as relative", () => {
    expect(isRelativePath("./foo.md")).toBe(true);
    expect(isRelativePath("../sibling.md")).toBe(true);
  });

  it("treats bare paths as relative", () => {
    expect(isRelativePath("foo.md")).toBe(true);
    expect(isRelativePath("docs/foo.md")).toBe(true);
  });

  it("rejects absolute paths", () => {
    expect(isRelativePath("/org/project")).toBe(false);
  });

  it("rejects URLs with a scheme", () => {
    expect(isRelativePath("https://example.com/foo.png")).toBe(false);
    expect(isRelativePath("http://example.com/foo.png")).toBe(false);
    expect(isRelativePath("mailto:foo@bar.com")).toBe(false);
    expect(isRelativePath("data:image/png;base64,abc")).toBe(false);
  });

  it("rejects anchor-only fragments", () => {
    expect(isRelativePath("#section")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isRelativePath("")).toBe(false);
  });
});
