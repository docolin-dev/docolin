import { describe, it, expect } from "bun:test";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import type { Root } from "mdast";
import {
  remarkDocomd,
  remarkTabGroup,
  tabToMarkdown,
  type Admonition,
  type DocoTab,
  type DocoTabbedSet,
} from "./index";

// Parse markdown to mdast with GFM + docomd. A tab body is re-parsed standalone,
// so these prove labels, nesting, and termination, not just the opener.
function parse(md: string): Root {
  return unified().use(remarkParse).use(remarkGfm).use(remarkDocomd).parse(md);
}

// Parse, then run the grouping transform (consecutive tabs -> one set).
function parseGrouped(md: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDocomd).use(remarkTabGroup);
  return processor.runSync(processor.parse(md));
}

// Serialize back to markdown the way prettier-plugin-docomd does (ungrouped tabs).
function serialize(md: string): string {
  return toMarkdown(parse(md), { extensions: [tabToMarkdown()] });
}

describe("content tab opener", () => {
  it("parses a quoted label and re-parsed body", () => {
    const tab = parse('=== "Linux"\n    Use `apt`.\n').children[0] as DocoTab;
    expect(tab.type).toBe("docoTab");
    expect(tab.label).toBe("Linux");
    expect(tab.children[0]?.type).toBe("paragraph");
  });

  it("requires exactly three equals (==== is not a tab)", () => {
    expect(parse('==== "x"\n    y\n').children[0]?.type).not.toBe("docoTab");
  });

  it("leaves a setext heading underline alone (=== with no label)", () => {
    expect(parse("Title\n===\n").children[0]?.type).toBe("heading");
  });

  it("re-parses the body so a fenced code block survives inside a tab", () => {
    const tab = parse('=== "sh"\n    ```bash\n    ls\n    ```\n').children[0] as DocoTab;
    expect(tab.children[0]?.type).toBe("code");
  });
});

describe("content tab grouping", () => {
  it("wraps consecutive tabs in one set, in order", () => {
    const tree = parseGrouped('=== "a"\n    one\n\n=== "b"\n    two\n');
    expect(tree.children.length).toBe(1);
    const set = tree.children[0] as DocoTabbedSet;
    expect(set.type).toBe("docoTabbedSet");
    expect(set.children.map((tab) => tab.label)).toEqual(["a", "b"]);
  });

  it("wraps even a single tab in a set", () => {
    expect((parseGrouped('=== "solo"\n    x\n').children[0] as DocoTabbedSet).type).toBe(
      "docoTabbedSet",
    );
  });

  it("splits tabs separated by other content into separate sets", () => {
    const tree = parseGrouped('=== "a"\n    one\n\nbetween\n\n=== "b"\n    two\n');
    expect(tree.children.filter((child) => child.type === "docoTabbedSet").length).toBe(2);
  });

  it("groups tabs nested inside another tab", () => {
    const md = '=== "outer"\n    === "in1"\n        a\n\n    === "in2"\n        b\n';
    const outer = (parseGrouped(md).children[0] as DocoTabbedSet).children[0];
    const inner = outer.children.find(
      (child): child is DocoTabbedSet => child.type === "docoTabbedSet",
    );
    expect(inner?.children.map((tab) => tab.label)).toEqual(["in1", "in2"]);
  });

  it("re-parses + groups tabs inside an admonition body (mutual nesting)", () => {
    const adm = parse('!!! note\n    === "a"\n        one\n').children[0] as Admonition;
    expect(adm.type).toBe("admonition");
    expect(adm.children.some((child) => child.type === "docoTab")).toBe(true);
  });
});

describe("content tab round-trip", () => {
  it("serializes back to === source with a 4-space body", () => {
    const out = serialize('=== "Linux"\n    Use apt.\n');
    expect(out).toContain('=== "Linux"');
    expect(out).toContain("    Use apt.");
  });
});
