import { describe, it, expect } from "bun:test";
import { sitemapSchema } from "./sitemap-schema";

describe("sitemapSchema", () => {
  it("accepts a flat list of leaves", () => {
    const result = sitemapSchema.safeParse([
      { title: "Install", url: "./install.md" },
      { title: "Configure", url: "./configure.md" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts nested branches", () => {
    const result = sitemapSchema.safeParse([
      {
        title: "Setup",
        children: [
          { title: "Install", url: "./install.md" },
          {
            title: "Configure",
            children: [
              { title: "Basic", url: "./configure-basic.md" },
              { title: "Advanced", url: "./configure-advanced.md" },
            ],
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects entries with both url and children", () => {
    // url xor children: a branch clicking through to a page is ambiguous and
    // the renderer can't reliably display it.
    const result = sitemapSchema.safeParse([
      {
        title: "Setup",
        url: "./setup.md",
        children: [{ title: "Install", url: "./install.md" }],
      },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects entries with neither url nor children", () => {
    const result = sitemapSchema.safeParse([{ title: "Dangling group" }]);
    expect(result.success).toBe(false);
  });

  it("rejects entries with an empty title", () => {
    const result = sitemapSchema.safeParse([{ title: "", url: "./foo.md" }]);
    expect(result.success).toBe(false);
  });

  it("rejects entries with an empty children list", () => {
    // An empty children: [] would be a branch with no destinations, which is
    // a no-op visually. Make the author choose: leaf or remove the entry.
    const result = sitemapSchema.safeParse([{ title: "Empty group", children: [] }]);
    expect(result.success).toBe(false);
  });

  it("rejects entries with a malformed url", () => {
    const result = sitemapSchema.safeParse([{ title: "Bare", url: "foo.md" }]);
    expect(result.success).toBe(false);
  });

  it("accepts soft URLs (path-by-kind) since they're just paths", () => {
    const result = sitemapSchema.safeParse([
      { title: "Firewall guide", url: "/network/firewall/setup" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts an empty top-level array (explicit no-sidebar)", () => {
    const result = sitemapSchema.safeParse([]);
    expect(result.success).toBe(true);
  });
});
