import { describe, it, expect } from "bun:test";
import {
  findMintlifyConfig,
  parseMintlifyConfig,
  docsDirForConfig,
  configPathsFor,
} from "./detect";
import { navToSitemap } from "./nav-to-sitemap";
import { hasDocolinFrontmatter, mintlifyMdxToDocoSource } from "./convert";

describe("findMintlifyConfig", () => {
  it("finds a nested config when no subpath is set", () => {
    const tree = ["README.md", "apps/docs/docs.json", "apps/docs/overview.mdx"];
    expect(findMintlifyConfig(tree, null)).toBe("apps/docs/docs.json");
  });

  it("finds a root config", () => {
    expect(findMintlifyConfig(["docs.json", "intro.mdx"], null)).toBe("docs.json");
  });

  it("only looks in the configured subpath", () => {
    const tree = ["docs.json", "apps/docs/mint.json"];
    expect(findMintlifyConfig(tree, "apps/docs")).toBe("apps/docs/mint.json");
  });

  it("prefers docs.json over mint.json and the shallowest path", () => {
    const tree = ["a/b/docs.json", "mint.json", "docs.json"];
    expect(findMintlifyConfig(tree, null)).toBe("docs.json");
  });

  it("returns null when there is no config", () => {
    expect(findMintlifyConfig(["intro.md", "guide.md"], null)).toBeNull();
  });

  it("derives the docs dir and candidate paths", () => {
    expect(docsDirForConfig("apps/docs/docs.json")).toBe("apps/docs");
    expect(docsDirForConfig("docs.json")).toBe("");
    expect(configPathsFor("apps/docs")).toEqual(["apps/docs/docs.json", "apps/docs/mint.json"]);
  });
});

// An inline fixture modeled on a real docs.json (tabs -> groups -> pages, plus an
// OpenAPI "Endpoints" group). Tests must be self-contained; never read from tmp/.
const NAVIGATION = {
  tabs: [
    {
      tab: "Documentation",
      groups: [{ group: "Get Started", pages: ["overview", "quickstart"] }],
    },
    {
      tab: "API Reference",
      groups: [
        { group: "Getting Started", pages: ["api/getting-started", "api/authentication"] },
        {
          group: "Endpoints",
          openapi: { source: "https://api.example.com/openapi.json" },
          pages: [{ group: "Posts", pages: ["GET /v1/posts", "POST /v1/posts/generate"] }],
        },
      ],
    },
  ],
};

describe("parseMintlifyConfig + navToSitemap", () => {
  it("parses the config name and navigation", () => {
    const json = JSON.stringify({ name: "Notra Documentation", navigation: NAVIGATION });
    const parsed = parseMintlifyConfig(json);
    expect(parsed?.name).toBe("Notra Documentation");
    expect(parsed?.navigation).not.toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseMintlifyConfig("{ not json")).toBeNull();
  });

  it("converts tab navigation to a sidebar with absolute urls", () => {
    const sitemap = navToSitemap(NAVIGATION, { orgSlug: "notra", projectSlug: "docs" });
    const titles = sitemap.map((n) => n.title);
    expect(titles).toContain("Documentation");
    expect(titles).toContain("API Reference");

    const docTab = sitemap.find((n) => n.title === "Documentation");
    const getStarted = docTab?.children?.find((n) => n.title === "Get Started");
    const overview = getStarted?.children?.find((n) => n.title === "Overview");
    expect(overview?.url).toBe("/notra/docs/overview");
  });

  it("skips OpenAPI-generated endpoints and drops their empty group", () => {
    const sitemap = navToSitemap(NAVIGATION, { orgSlug: "notra", projectSlug: "docs" });
    const flat = JSON.stringify(sitemap);
    expect(flat).not.toContain("/v1/posts");
    expect(flat).not.toContain("Endpoints");
  });

  it("handles the legacy array-of-groups navigation", () => {
    const legacy = [{ group: "Intro", pages: ["start"] }];
    const sitemap = navToSitemap(legacy, { orgSlug: "o", projectSlug: "p" });
    expect(sitemap).toEqual([
      { title: "Intro", children: [{ title: "Start", url: "/o/p/start" }] },
    ]);
  });

  it("unwraps a languages nav to the default language (mintlify/docs' own layout)", () => {
    // The real mintlify/docs shape: languages -> tabs -> groups -> pages.
    const nav = {
      languages: [
        {
          language: "en",
          tabs: [{ tab: "Documentation", groups: [{ group: "Get started", pages: ["index"] }] }],
        },
        {
          language: "zh",
          tabs: [{ tab: "文档", groups: [{ group: "开始", pages: ["zh/index"] }] }],
        },
      ],
    };
    const sitemap = navToSitemap(nav, { orgSlug: "o", projectSlug: "p" });
    expect(sitemap).toEqual([
      {
        title: "Documentation",
        children: [{ title: "Get started", children: [{ title: "Index", url: "/o/p/index" }] }],
      },
    ]);
  });

  it("unwraps a versions nav to the first version with content", () => {
    const nav = {
      versions: [
        { version: "v3", pages: [] }, // empty default must not blank the sidebar
        { version: "v2", groups: [{ group: "Guides", pages: ["guide"] }] },
      ],
    };
    const sitemap = navToSitemap(nav, { orgSlug: "o", projectSlug: "p" });
    expect(sitemap).toEqual([
      { title: "Guides", children: [{ title: "Guide", url: "/o/p/guide" }] },
    ]);
  });

  it("converts anchors and dropdowns like tabs", () => {
    const nav = {
      anchors: [
        { anchor: "Docs", pages: ["start"] },
        { anchor: "Community", href: "https://discord.example" }, // external: no pages, dropped
      ],
    };
    expect(navToSitemap(nav, { orgSlug: "o", projectSlug: "p" })).toEqual([
      { title: "Docs", children: [{ title: "Start", url: "/o/p/start" }] },
    ]);

    const dropdowns = { dropdowns: [{ dropdown: "SDKs", pages: ["sdk/js"] }] };
    expect(navToSitemap(dropdowns, { orgSlug: "o", projectSlug: "p" })).toEqual([
      { title: "SDKs", children: [{ title: "Js", url: "/o/p/sdk/js" }] },
    ]);
  });

  it("leads a group with its root page (url XOR children, so root becomes a leaf)", () => {
    const nav = { groups: [{ group: "CLI", root: "cli/index", pages: ["cli/install"] }] };
    expect(navToSitemap(nav, { orgSlug: "o", projectSlug: "p" })).toEqual([
      {
        title: "CLI",
        children: [
          { title: "Index", url: "/o/p/cli/index" },
          { title: "Install", url: "/o/p/cli/install" },
        ],
      },
    ]);
  });
});

describe("convert", () => {
  it("detects whether docolin frontmatter is present", () => {
    const mintlifyOnly = '---\ntitle: "X"\ndescription: "Y"\n---\nBody.';
    expect(hasDocolinFrontmatter(mintlifyOnly)).toBe(false);

    const withDocolin = [
      "---",
      'title: "X"',
      "authors:",
      "  - handle: someone",
      "docolin:",
      "  schema_version: 1",
      "  kind: tools/notra/overview",
      "  type: reference",
      "---",
      "Body.",
    ].join("\n");
    expect(hasDocolinFrontmatter(withDocolin)).toBe(true);
  });

  it("converts the body but keeps the frontmatter verbatim", () => {
    const src =
      '---\n# a comment survives too\ntitle: "Quickstart"\nicon: "rocket"\n---\n<Note>Hi.</Note>';
    const out = mintlifyMdxToDocoSource(src, "fontawesome");
    // Verbatim means VERBATIM: quoting, key order, even comments are untouched
    // (gray-matter used to re-emit normalized YAML; the raw splitter does not).
    expect(out).toContain('title: "Quickstart"');
    expect(out).toContain('icon: "rocket"'); // unknown keys kept; docolin's parser ignores them
    expect(out).toContain("# a comment survives too");
    expect(out).toContain("!!! note");
    expect(out).not.toContain("<Note>");
  });

  it("prefixes card icon names with the project's icon library", () => {
    const card = '<Card title="API" icon="code" href="/api">Build.</Card>';
    // Font Awesome project -> fa- prefix so the renderer leads with Font Awesome.
    expect(mintlifyMdxToDocoSource(card, "fontawesome")).toContain("{ icon=fa-code }");
    // Tabler project -> tb- prefix.
    expect(mintlifyMdxToDocoSource(card, "tabler")).toContain("{ icon=tb-code }");
    // Lucide project -> bare name (docolin's default set).
    expect(mintlifyMdxToDocoSource(card, "lucide")).toContain("{ icon=code }");
  });
});
