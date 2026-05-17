import { describe, it, expect } from "bun:test";
import { sitemapPathFor, parseGlobalSitemapText, resolveDocoSitemap } from "./sitemap";

describe("sitemapPathFor", () => {
  it("returns the repo-root location regardless of subpath", () => {
    // docolin/ is project-level config, not docs-level. Sitemap always lives
    // at repo root, never under the docs subpath.
    expect(sitemapPathFor(null)).toBe("docolin/sitemap.yaml");
    expect(sitemapPathFor("")).toBe("docolin/sitemap.yaml");
    expect(sitemapPathFor("docs")).toBe("docolin/sitemap.yaml");
    expect(sitemapPathFor("docs/")).toBe("docolin/sitemap.yaml");
    expect(sitemapPathFor("a/b/c")).toBe("docolin/sitemap.yaml");
  });
});

describe("parseGlobalSitemapText", () => {
  it("parses a valid file with the {sitemap: [...]} shape", () => {
    const raw = `
sitemap:
  - title: Install
    url: ./install.md
  - title: Guides
    children:
      - title: Auth
        url: ./auth.md
`;
    const result = parseGlobalSitemapText(raw);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.sitemap).toHaveLength(2);
      expect(result.sitemap[0].title).toBe("Install");
    }
  });

  it("treats an empty file as explicit no-sidebar", () => {
    expect(parseGlobalSitemapText("").status).toBe("empty");
    expect(parseGlobalSitemapText("   \n\n").status).toBe("empty");
  });

  it("treats a file with just `sitemap: []` as empty", () => {
    expect(parseGlobalSitemapText("sitemap: []").status).toBe("empty");
  });

  it("accepts a bare top-level array (common author mistake)", () => {
    const raw = `
- title: Install
  url: ./install.md
`;
    const result = parseGlobalSitemapText(raw);
    expect(result.status).toBe("found");
  });

  it("returns invalid for malformed YAML", () => {
    const result = parseGlobalSitemapText("sitemap:\n  - title: [unclosed");
    expect(result.status).toBe("invalid");
  });

  it("returns invalid when an entry has both url and children", () => {
    const raw = `
sitemap:
  - title: Setup
    url: ./setup.md
    children:
      - title: Install
        url: ./install.md
`;
    const result = parseGlobalSitemapText(raw);
    expect(result.status).toBe("invalid");
  });
});

describe("resolveDocoSitemap", () => {
  const found = {
    status: "found" as const,
    sitemap: [{ title: "Install", url: "./install.md" }],
  };

  it("uses the per-doco override when present", () => {
    const perDoco = [{ title: "Custom", url: "./custom.md" }];
    expect(resolveDocoSitemap(perDoco, found)).toEqual(perDoco);
  });

  it("treats an empty per-doco override as no-sidebar", () => {
    expect(resolveDocoSitemap([], found)).toBeNull();
  });

  it("falls through to the global when no per-doco override exists", () => {
    expect(resolveDocoSitemap(undefined, found)).toEqual(found.sitemap);
  });

  it("returns null when the global is empty", () => {
    expect(resolveDocoSitemap(undefined, { status: "empty" })).toBeNull();
  });

  it("returns null when the global is missing", () => {
    expect(resolveDocoSitemap(undefined, { status: "missing" })).toBeNull();
  });

  it("returns null when the global is invalid (orchestrator surfaces the error)", () => {
    expect(resolveDocoSitemap(undefined, { status: "invalid", message: "bad yaml" })).toBeNull();
  });
});
