import { describe, it, expect } from "bun:test";
import {
  sitemapPathForDir,
  isDocoSitemapFile,
  ancestorDirs,
  parseSitemapFileText,
  resolveDocoSitemap,
  createSitemapResolver,
  type SitemapFileFetch,
} from "./sitemap";

describe("sitemapPathForDir", () => {
  it("returns the bare filename at the repo root", () => {
    expect(sitemapPathForDir("")).toBe("doco_sitemap.yaml");
  });

  it("joins the directory for nested locations", () => {
    expect(sitemapPathForDir("docs")).toBe("docs/doco_sitemap.yaml");
    expect(sitemapPathForDir("docs/auth")).toBe("docs/auth/doco_sitemap.yaml");
  });
});

describe("isDocoSitemapFile", () => {
  it("recognizes the file at the docs root", () => {
    expect(isDocoSitemapFile("doco_sitemap.yaml", null)).toBe(true);
    expect(isDocoSitemapFile("docs/doco_sitemap.yaml", "docs")).toBe(true);
    expect(isDocoSitemapFile("docs/doco_sitemap.yaml", "docs/")).toBe(true);
  });

  it("recognizes the file nested below the docs root", () => {
    expect(isDocoSitemapFile("a/b/doco_sitemap.yaml", null)).toBe(true);
    expect(isDocoSitemapFile("docs/auth/doco_sitemap.yaml", "docs")).toBe(true);
  });

  it("rejects files outside the docs root", () => {
    // A sitemap at the repo root does not belong to a project scoped to docs/.
    expect(isDocoSitemapFile("doco_sitemap.yaml", "docs")).toBe(false);
    expect(isDocoSitemapFile("other/doco_sitemap.yaml", "docs")).toBe(false);
  });

  it("rejects prefix-as-substring matches", () => {
    expect(isDocoSitemapFile("docs2/doco_sitemap.yaml", "docs")).toBe(false);
  });

  it("rejects the wrong filename", () => {
    expect(isDocoSitemapFile("docs/sitemap.yaml", "docs")).toBe(false);
    expect(isDocoSitemapFile("docs/doco_sitemap.yml", "docs")).toBe(false);
  });
});

describe("ancestorDirs", () => {
  it("walks from the doco's directory up to the docs root", () => {
    expect(ancestorDirs("docs/auth/signin.md", "docs")).toEqual(["docs/auth", "docs"]);
  });

  it("returns just the root for a doc directly in it", () => {
    expect(ancestorDirs("docs/install.md", "docs")).toEqual(["docs"]);
  });

  it("walks up to the repo root when there is no subpath", () => {
    expect(ancestorDirs("a/b/x.md", null)).toEqual(["a/b", "a", ""]);
    expect(ancestorDirs("x.md", null)).toEqual([""]);
  });

  it("never climbs above the docs root", () => {
    // A doco outside the configured subpath has no applicable directories.
    expect(ancestorDirs("other/x.md", "docs")).toEqual([]);
  });
});

describe("parseSitemapFileText", () => {
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
    const result = parseSitemapFileText(raw);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.sitemap).toHaveLength(2);
      expect(result.sitemap[0].title).toBe("Install");
    }
  });

  it("treats an empty file as explicit no-sidebar", () => {
    expect(parseSitemapFileText("").status).toBe("empty");
    expect(parseSitemapFileText("   \n\n").status).toBe("empty");
  });

  it("treats a file with just `sitemap: []` as empty", () => {
    expect(parseSitemapFileText("sitemap: []").status).toBe("empty");
  });

  it("accepts a bare top-level array (common author mistake)", () => {
    const raw = `
- title: Install
  url: ./install.md
`;
    expect(parseSitemapFileText(raw).status).toBe("found");
  });

  it("returns invalid for malformed YAML", () => {
    expect(parseSitemapFileText("sitemap:\n  - title: [unclosed").status).toBe("invalid");
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
    expect(parseSitemapFileText(raw).status).toBe("invalid");
  });
});

// A fake fetcher backed by a map of repo-relative path -> file contents.
function fakeFetcher(files: Record<string, string>): SitemapFileFetch {
  return (path) =>
    Promise.resolve(
      path in files
        ? { ok: true as const, content: files[path] }
        : { ok: false as const, reason: "not_found" },
    );
}

const ROOT = `sitemap:\n  - title: Root\n    url: ./root.md\n`;
const NESTED = `sitemap:\n  - title: Nested\n    url: ./nested.md\n`;

describe("createSitemapResolver (cascade)", () => {
  it("uses the nearest doco_sitemap.yaml", async () => {
    const resolver = createSitemapResolver({
      subpath: "docs",
      fetchFile: fakeFetcher({
        "docs/doco_sitemap.yaml": ROOT,
        "docs/auth/doco_sitemap.yaml": NESTED,
      }),
    });
    expect(await resolver.resolve("docs/auth/signin.md")).toEqual({
      sitemap: [{ title: "Nested", url: "./nested.md" }],
      sourcePath: "docs/auth/doco_sitemap.yaml",
    });
    // A sibling subtree with no nearer file inherits the docs-root sitemap.
    expect(await resolver.resolve("docs/guides/intro.md")).toEqual({
      sitemap: [{ title: "Root", url: "./root.md" }],
      sourcePath: "docs/doco_sitemap.yaml",
    });
  });

  it("inherits from an ancestor when no nearer file exists", async () => {
    const resolver = createSitemapResolver({
      subpath: "docs",
      fetchFile: fakeFetcher({ "docs/doco_sitemap.yaml": ROOT }),
    });
    expect(await resolver.resolve("docs/a/b/c/deep.md")).toEqual({
      sitemap: [{ title: "Root", url: "./root.md" }],
      sourcePath: "docs/doco_sitemap.yaml",
    });
  });

  it("lets an empty nested file opt a subtree out (shadows the parent)", async () => {
    const resolver = createSitemapResolver({
      subpath: "docs",
      fetchFile: fakeFetcher({
        "docs/doco_sitemap.yaml": ROOT,
        "docs/auth/doco_sitemap.yaml": "sitemap: []",
      }),
    });
    expect(await resolver.resolve("docs/auth/signin.md")).toBeNull();
  });

  it("ignores a sitemap file above the docs root", async () => {
    const resolver = createSitemapResolver({
      subpath: "docs",
      // A file at the repo root must not leak into a docs/-scoped project.
      fetchFile: fakeFetcher({ "doco_sitemap.yaml": ROOT }),
    });
    expect(await resolver.resolve("docs/install.md")).toBeNull();
  });

  it("resolves from the repo root when there is no subpath", async () => {
    const resolver = createSitemapResolver({
      subpath: null,
      fetchFile: fakeFetcher({ "doco_sitemap.yaml": ROOT }),
    });
    expect(await resolver.resolve("a/b/x.md")).toEqual({
      sitemap: [{ title: "Root", url: "./root.md" }],
      sourcePath: "doco_sitemap.yaml",
    });
  });

  it("falls through an invalid ancestor to a valid parent", async () => {
    const resolver = createSitemapResolver({
      subpath: "docs",
      fetchFile: fakeFetcher({
        "docs/doco_sitemap.yaml": ROOT,
        "docs/auth/doco_sitemap.yaml": "sitemap:\n  - title: [unclosed",
      }),
    });
    // The broken nested file is skipped; the subtree keeps the parent's sidebar.
    expect(await resolver.resolve("docs/auth/signin.md")).toEqual({
      sitemap: [{ title: "Root", url: "./root.md" }],
      sourcePath: "docs/doco_sitemap.yaml",
    });
  });
});

describe("resolveDocoSitemap", () => {
  const cascade = {
    sitemap: [{ title: "Root", url: "./root.md" }],
    sourcePath: "docs/doco_sitemap.yaml",
  };

  it("uses the per-doco override, based at the doco's own path", () => {
    const perDoco = [{ title: "Custom", url: "./custom.md" }];
    expect(resolveDocoSitemap(perDoco, "docs/a.md", cascade)).toEqual({
      sitemap: perDoco,
      sourcePath: "docs/a.md",
    });
  });

  it("treats an empty per-doco override as no-sidebar", () => {
    expect(resolveDocoSitemap([], "docs/a.md", cascade)).toBeNull();
  });

  it("falls through to the cascade when no per-doco override exists", () => {
    expect(resolveDocoSitemap(undefined, "docs/a.md", cascade)).toEqual(cascade);
  });

  it("returns null when the cascade resolved to nothing", () => {
    expect(resolveDocoSitemap(undefined, "docs/a.md", null)).toBeNull();
  });
});
