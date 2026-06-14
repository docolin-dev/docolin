import { describe, it, expect } from "bun:test";
import { convertBody } from "./body-pipeline";
import { resolveLink } from "$lib/doco/resolve-link";

// The sync-time body pipeline round-trips markdown (parse -> rewrite -> stringify).
// It must preserve docomd constructs (admonitions, tabs, cards, steps, accordions),
// which depend on 4-space body indentation and are NOT CommonMark. A naive
// parse/stringify without the docomd extensions flattens them into plain text,
// which is exactly the bug these tests pin: it rendered fine in the playground
// (full pipeline) but broke in synced docs (this pipeline).

const passthrough = {
  rewriteImageUrl: (url: string) => Promise.resolve(url),
  rewriteLink: (url: string) => url,
};

describe("convertBody preserves docomd constructs", () => {
  it("keeps an admonition", async () => {
    const out = await convertBody(
      '!!! warning "Chalk up"\n    The bars get slippery.\n',
      passthrough,
    );
    expect(out).toContain('!!! warning "Chalk up"');
    expect(out).toContain("slippery");
  });

  it("keeps a collapsible", async () => {
    const out = await convertBody('??? note "Hidden"\n    A secret snack.\n', passthrough);
    expect(out).toContain('??? note "Hidden"');
  });

  it("keeps content tabs", async () => {
    const out = await convertBody(
      '=== "Linux"\n    Install via apt.\n\n=== "macOS"\n    Install via brew.\n',
      passthrough,
    );
    expect(out).toContain('=== "Linux"');
    expect(out).toContain('=== "macOS"');
  });

  it("keeps a card grid", async () => {
    const out = await convertBody(
      "!!! cards { cols=2 }\n    - **A**\n\n      Body.\n",
      passthrough,
    );
    expect(out).toContain("!!! cards");
  });

  it("keeps a stepper", async () => {
    const out = await convertBody("!!! steps\n    1. One\n    2. Two\n", passthrough);
    expect(out).toContain("!!! steps");
  });

  it("preserves an image's attr-list (light/dark variant classes)", async () => {
    // The attr-list is consumed at render time, not here. Canonicalize must pass
    // the `{ .dark-only }` text through untouched, or the variant breaks in synced
    // docs while the playground looks fine.
    const out = await convertBody("![Dark](/a-dark.png){ .dark-only }\n", passthrough);
    expect(out).toContain("](/a-dark.png)");
    expect(out).toContain("{ .dark-only }");
  });

  it("is idempotent on an admonition", async () => {
    const once = await convertBody('!!! tip "Note"\n    Body text here.\n', passthrough);
    const twice = await convertBody(once, passthrough);
    expect(twice).toBe(once);
  });
});

describe("convertBody handles math", () => {
  // Admonition (and tab) bodies are re-parsed with the math extension, so a `$x$`
  // inside a callout becomes an inlineMath node. Without the math serializer on the
  // stringify side, mdast-util-to-markdown throws "Cannot handle unknown node
  // inlineMath" and the whole sync crashes.
  it("keeps inline math inside an admonition", async () => {
    const out = await convertBody('!!! tip "Gauss"\n    The sum is $5050$.\n', passthrough);
    expect(out).toContain("!!! tip");
    expect(out).toContain("$5050$");
  });

  it("keeps top-level inline and block math", async () => {
    const out = await convertBody("Inline $x^2$ and a block:\n\n$$\na = b\n$$\n", passthrough);
    expect(out).toContain("$x^2$");
    expect(out).toContain("a = b");
  });
});

describe("convertBody still rewrites images and links", () => {
  it("rewrites a relative link inside an admonition", async () => {
    const out = await convertBody("!!! note\n    See [other](./other.md).\n", {
      rewriteImageUrl: (url) => Promise.resolve(url),
      rewriteLink: (url) => (url === "./other.md" ? "/org/project/other" : url),
    });
    expect(out).toContain("/org/project/other");
    expect(out).not.toContain("./other.md");
  });

  it("rewrites an image url", async () => {
    const out = await convertBody("![alt](./pic.png)\n", {
      rewriteImageUrl: (url) => Promise.resolve(url === "./pic.png" ? "https://cdn/pic.png" : url),
      rewriteLink: (url) => url,
    });
    expect(out).toContain("https://cdn/pic.png");
  });

  it("rewrites a relative .mdx link (Mintlify imports)", async () => {
    const out = await convertBody("See [mcp](./mcp.mdx).\n", {
      rewriteImageUrl: (url) => Promise.resolve(url),
      rewriteLink: (url) => (url === "./mcp.mdx" ? "/notra/notra/devtools/mcp" : url),
    });
    expect(out).toContain("/notra/notra/devtools/mcp");
    expect(out).not.toContain("./mcp.mdx");
  });

  it("rewrites a Mintlify root-absolute link when rewriteAbsoluteLink is set", async () => {
    const out = await convertBody("See [mcp](/devtools/mcp).\n", {
      rewriteImageUrl: (url) => Promise.resolve(url),
      rewriteLink: (url) => url,
      rewriteAbsoluteLink: (url) => `/notra/notra${url}`,
    });
    expect(out).toContain("/notra/notra/devtools/mcp");
  });

  it("rewrites a relative link that carries a fragment, keeping the fragment", async () => {
    const out = await convertBody("See [inline code](./text-and-lists.md#inline-code).\n", {
      rewriteImageUrl: (url) => Promise.resolve(url),
      rewriteLink: (url) =>
        resolveLink(url, {
          docoPath: "docs/a.md",
          subpath: "docs",
          allowMdx: true,
          websiteBase: "/org/project",
          forge: { kind: "repo", repoUrl: "https://github.com/o/r", ref: { commit: "x" } },
        }),
    });
    expect(out).toContain("/org/project/text-and-lists#inline-code");
    expect(out).not.toContain(".md#");
  });

  it("rewrites a Mintlify root-absolute link with a fragment, keeping the fragment", async () => {
    const out = await convertBody("See [setup](/devtools/mcp#setup).\n", {
      rewriteImageUrl: (url) => Promise.resolve(url),
      rewriteLink: (url) => url,
      rewriteAbsoluteLink: (url) => `/notra/notra${url}`,
    });
    expect(out).toContain("/notra/notra/devtools/mcp#setup");
    expect(out).not.toContain("mcp#setup#");
  });

  it("leaves root-absolute links alone without rewriteAbsoluteLink (docolin repos)", async () => {
    const out = await convertBody("See [fw](/network/firewall/setup).\n", {
      rewriteImageUrl: (url) => Promise.resolve(url),
      rewriteLink: (url) => url,
    });
    expect(out).toContain("/network/firewall/setup");
  });
});
