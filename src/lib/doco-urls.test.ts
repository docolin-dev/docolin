import { describe, it, expect } from "bun:test";
import { pathFromSourcePath, stripDocExtension, rebuildPathInSource } from "./doco-urls";

describe("stripDocExtension", () => {
  it("drops .md and .mdx, case-insensitive", () => {
    expect(stripDocExtension("a/b.md")).toBe("a/b");
    expect(stripDocExtension("a/b.mdx")).toBe("a/b");
    expect(stripDocExtension("a/b.MDX")).toBe("a/b");
    expect(stripDocExtension("a/b")).toBe("a/b");
    expect(stripDocExtension("a/b.png")).toBe("a/b.png");
  });
});

describe("pathFromSourcePath", () => {
  it("strips the subpath and the .md extension", () => {
    expect(pathFromSourcePath("docs/intro.md", "docs")).toBe("intro");
    expect(pathFromSourcePath("guides/install.md", null)).toBe("guides/install");
  });

  it("strips a Mintlify .mdx extension", () => {
    // The bug this guards: .mdx was left on, so URLs became `/…/mcp.mdx`.
    expect(pathFromSourcePath("apps/docs/devtools/mcp.mdx", "apps/docs")).toBe("devtools/mcp");
    expect(pathFromSourcePath("overview.mdx", null)).toBe("overview");
  });
});

describe("rebuildPathInSource", () => {
  it("builds the .md form (resolveDocoIdentity also tries the .mdx sibling)", () => {
    expect(rebuildPathInSource("devtools/mcp", "apps/docs")).toBe("apps/docs/devtools/mcp.md");
    expect(rebuildPathInSource("intro", null)).toBe("intro.md");
  });
});
