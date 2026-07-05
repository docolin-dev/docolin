import { describe, it, expect } from "bun:test";
import { isDocoFile, isOptOutReadme, isReadmePath } from "./file-scope";

describe("isDocoFile", () => {
  describe("with no configured subpath", () => {
    it("accepts root .md files", () => {
      expect(isDocoFile("install.md", null)).toBe(true);
      expect(isDocoFile("install.md", "")).toBe(true);
    });

    it("accepts nested .md files", () => {
      expect(isDocoFile("guides/install.md", null)).toBe(true);
    });

    it("keeps READMEs path-eligible everywhere (the gate is content-based)", () => {
      // READMEs are opt-in via frontmatter (isOptOutReadme), not excluded by
      // path, so a root README WITH a docolin block can be a doco.
      expect(isDocoFile("README.md", null)).toBe(true);
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

describe("isReadmePath", () => {
  it("matches READMEs in any directory and any case", () => {
    expect(isReadmePath("README.md")).toBe(true);
    expect(isReadmePath("docs/README.md")).toBe(true);
    expect(isReadmePath("docs/readme.md")).toBe(true);
    expect(isReadmePath("docs/ReadMe.MD")).toBe(true);
    expect(isReadmePath("docs/README.mdx")).toBe(true);
  });

  it("does not match non-READMEs or look-alikes", () => {
    expect(isReadmePath("docs/install.md")).toBe(false);
    expect(isReadmePath("docs/README-first.md")).toBe(false);
    expect(isReadmePath("READMEs/install.md")).toBe(false);
  });
});

describe("isOptOutReadme", () => {
  const withDocolin =
    "---\nauthors:\n  - handle: sam\ndocolin:\n  kind: os/linux/x\n  type: how-to\n---\n\nBody.";
  const withoutDocolin = "---\ntitle: My project\n---\n\nBody.";

  it("skips a README with no frontmatter at all", () => {
    expect(isOptOutReadme("README.md", "# My project\n\nHello.")).toBe(true);
  });

  it("skips a README whose frontmatter lacks a docolin key", () => {
    expect(isOptOutReadme("docs/README.md", withoutDocolin)).toBe(true);
  });

  it("opts in a README with a docolin block", () => {
    expect(isOptOutReadme("README.md", withDocolin)).toBe(false);
  });

  it("opts in a README with a HALF-WRITTEN docolin block (so its error surfaces)", () => {
    // The key alone opts in, even when the block would fail validation;
    // silently vanishing would hide the author's mistake.
    expect(isOptOutReadme("README.md", "---\ndocolin:\n  kind: os/linux/x\n---\n\nBody.")).toBe(
      false,
    );
  });

  it("opts in a README whose broken YAML still mentions docolin (line-scan fallback)", () => {
    const brokenYaml = "---\ndocolin: {kind: [unclosed\n---\n\nBody.";
    expect(isOptOutReadme("README.md", brokenYaml)).toBe(false);
  });

  it("never gates a non-README, even without frontmatter", () => {
    expect(isOptOutReadme("docs/install.md", "# Install\n\nNo frontmatter.")).toBe(false);
  });
});
