import { describe, it, expect } from "bun:test";
import { resolveLink, splitFragment, type LinkResolveContext } from "./resolve-link";

const published: LinkResolveContext = {
  docoPath: "docs/authoring/overview.md",
  subpath: "docs",
  allowMdx: false,
  websiteBase: "/docolin/docolin",
  forge: {
    kind: "repo",
    repoUrl: "https://github.com/docolin-dev/docs",
    ref: { commit: "abc1234" },
  },
};

const preview: LinkResolveContext = {
  ...published,
  websiteBase: "/preview/docolin-x1",
  forge: { kind: "preview", blobBase: "/preview/blob/docolin-x1" },
};

describe("splitFragment", () => {
  it("splits and preserves the fragment", () => {
    expect(splitFragment("./a.md#sec")).toEqual({ path: "./a.md", fragment: "#sec" });
    expect(splitFragment("./a.md")).toEqual({ path: "./a.md", fragment: "" });
    expect(splitFragment("#sec")).toEqual({ path: "", fragment: "#sec" });
  });
});

describe("resolveLink (published)", () => {
  it("rewrites a relative .md doco link to its website URL", () => {
    expect(resolveLink("./quickstart.md", published)).toBe("/docolin/docolin/authoring/quickstart");
    expect(resolveLink("../tables.md", published)).toBe("/docolin/docolin/tables");
  });

  it("keeps a heading fragment on a doco link", () => {
    expect(resolveLink("./quickstart.md#step-2", published)).toBe(
      "/docolin/docolin/authoring/quickstart#step-2",
    );
  });

  it("sends a relative non-md repo file to the forge, pinned to the commit", () => {
    expect(resolveLink("../src/index.ts", published)).toBe(
      "https://github.com/docolin-dev/docs/blob/abc1234/docs/src/index.ts",
    );
  });

  it("sends a .md OUTSIDE the docs scope to the forge, not the website", () => {
    // ../../README.md resolves to repo-root README.md, which is not a doco slot.
    expect(resolveLink("../../README.md", published)).toBe(
      "https://github.com/docolin-dev/docs/blob/abc1234/README.md",
    );
  });

  it("passes through external, website-absolute, and anchor links unchanged", () => {
    expect(resolveLink("https://example.com/x", published)).toBe("https://example.com/x");
    expect(resolveLink("/os/linux/firewall", published)).toBe("/os/linux/firewall");
    expect(resolveLink("/docolin/docolin/authoring/tables", published)).toBe(
      "/docolin/docolin/authoring/tables",
    );
    expect(resolveLink("#section", published)).toBe("#section");
    expect(resolveLink("mailto:a@example.com", published)).toBe("mailto:a@example.com");
  });

  it("encodes spaces in a forge path", () => {
    expect(resolveLink("./a b.txt", published)).toBe(
      "https://github.com/docolin-dev/docs/blob/abc1234/docs/authoring/a%20b.txt",
    );
  });
});

describe("resolveLink (preview)", () => {
  it("rewrites a relative .md doco link to the preview URL space", () => {
    expect(resolveLink("./quickstart.md", preview)).toBe(
      "/preview/docolin-x1/authoring/quickstart",
    );
  });

  it("serves a non-doco repo file from the local blob route, not the forge", () => {
    expect(resolveLink("../src/index.ts", preview)).toBe(
      "/preview/blob/docolin-x1/docs/src/index.ts",
    );
  });
});
