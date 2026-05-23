import { describe, it, expect } from "bun:test";
import { codeToHast } from "shiki";
import { createMarkdownRenderer, extractToc } from "./index.ts";

// Render with a real shiki highlighter (static, like the server path). These pin
// the HTML the doco viewer's CSS depends on, so the marked -> remark swap is a
// parity swap, not a visual change.
const render = createMarkdownRenderer((code, lang) =>
  codeToHast(code, { lang, theme: "github-light" }),
);

describe("admonitions", () => {
  it("renders a callout with its type tint, icon, and title", async () => {
    const html = await render('!!! warning "Heads up"\n    Be careful.\n');
    expect(html).toContain("border-amber-500/50");
    expect(html).toContain("<svg");
    expect(html).toContain("Heads up");
    expect(html).toContain("Be careful.");
    expect(html).not.toContain("<details");
  });

  it("renders ??? as a collapsible details with the animation hook", async () => {
    const html = await render('???+ note "More"\n    body\n');
    expect(html).toContain("<details");
    expect(html).toContain("markdown-collapsible");
    expect(html).toContain("open");
  });

  it("falls back to the neutral box for unknown types", async () => {
    expect(await render("!!! mystery\n    surfaced typo\n")).toContain("border-foreground/20");
  });

  it("renders nested admonitions", async () => {
    const html = await render("!!! note\n    !!! tip\n        deep\n");
    expect(html).toContain("border-emerald-500/40");
    expect(html).toContain("deep");
  });
});

describe("standard markdown parity", () => {
  it("gives headings ids that match extractToc", async () => {
    expect(await render("## Hello World\n")).toContain('id="hello-world"');
    expect(extractToc("## Hello World\n")).toEqual([
      { level: 2, text: "Hello World", id: "hello-world" },
    ]);
  });

  it("opens external links in a new tab and leaves internal links alone", async () => {
    const html = await render("[ext](https://example.com) and [int](/local)\n");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain('href="/local"');
    expect(html).not.toContain('href="/local" target');
  });

  it("renders GFM task lists with the shadcn checkbox and no bullet", async () => {
    const html = await render("- [x] done\n- [ ] todo\n");
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("list-none");
  });

  it("renders GFM tables", async () => {
    expect(await render("| a | b |\n| - | - |\n| 1 | 2 |\n")).toContain("<table");
  });

  it("turns attr-list md-button links into styled buttons and strips the attr text", async () => {
    const html = await render("[Open it](/dash){ .md-button .md-button--primary }\n");
    expect(html).toContain('href="/dash"');
    expect(html).toContain("bg-primary");
    expect(html).not.toContain("md-button");
    expect(html).not.toContain("{ .md-button");
  });
});

describe("table of contents", () => {
  it("collects top-level h2 and h3 only", () => {
    const toc = extractToc("# Title\n\n## A\n\n### B\n\n#### C\n");
    expect(toc.map((entry) => entry.level)).toEqual([2, 3]);
    expect(toc.map((entry) => entry.text)).toEqual(["A", "B"]);
  });
});

describe("list-wrapping constructs", () => {
  it("renders steps as a numbered stepper, not a callout", async () => {
    const html = await render("!!! steps\n    1. First\n    2. Second\n    3. Third\n");
    expect(html).toContain("size-7");
    expect(html).toContain("First");
    expect(html).toContain("Third");
    expect(html).not.toContain("border-l-4");
  });

  it("shows a steps title only when one is given", async () => {
    expect(await render('!!! steps "Install"\n    1. a\n')).toContain("Install");
    expect(await render("!!! steps\n    1. a\n")).not.toContain(">Steps<");
  });

  it("renders cards in a column grid from { cols=N }", async () => {
    const html = await render("!!! cards { cols=2 }\n    - [A](/a)\n    - [B](/b)\n");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain('href="/a"');
  });

  it("makes a link-led card a clickable title block plus a muted description", async () => {
    const html = await render("!!! cards\n    - [Open](/x) details here\n");
    expect(html).toContain("card-link"); // stretched, whole card is the hit area
    expect(html).toContain("relative"); // card is the positioning context
    expect(html).toContain('href="/x"');
    expect(html).toContain(">Open<"); // title text (its own block)
    expect(html).toContain("text-muted-foreground"); // description block
    expect(html).toContain("details here");
  });

  it("leaves a card without a leading link non-clickable", async () => {
    expect(await render("!!! cards\n    - just text, no link\n")).not.toContain("card-link");
  });

  it("renders an icon from { icon=name } (any Lucide name)", async () => {
    const html = await render("!!! cards\n    - [Go](/g){ icon=rocket }\n      desc\n");
    expect(html).toContain("<svg");
    expect(html).toContain('href="/g"');
  });

  it("themes a card from { type=... } with the callout palette + default icon", async () => {
    const html = await render("!!! cards\n    - [Warn](/w){ type=warning }\n      careful\n");
    expect(html).toContain("border-amber-500/50");
    expect(html).toContain("<svg"); // the type's default icon
  });

  it("lays a card out horizontally with { horizontal }", async () => {
    const html = await render(
      "!!! cards\n    - [H](/h){ icon=zap horizontal }\n      side by side\n",
    );
    expect(html).toContain("flex items-start gap-4");
  });

  it("adds a top image from { img=url }", async () => {
    const html = await render("!!! cards\n    - [Pic](/p){ img=/y.jpg }\n      shot\n");
    expect(html).toContain('src="/y.jpg"');
    expect(html).toContain("h-auto"); // natural ratio, full card width
  });

  it("handles an external image URL even though gfm autolinks it in the attr list", async () => {
    const html = await render(
      "!!! cards\n    - [Pic](/p){ img=https://cdn.example.com/a.jpg }\n      shot\n",
    );
    expect(html).toContain('src="https://cdn.example.com/a.jpg"');
    expect(html).toContain("h-auto");
    expect(html).not.toContain("{ img"); // attr list fully consumed, not left as text
    expect(html).toContain("shot"); // description still renders
  });

  it("renders a custom CTA + arrow from { cta arrow }", async () => {
    const html = await render('!!! cards\n    - [Docs](/d){ cta="Read more" arrow }\n      go\n');
    expect(html).toContain("Read more");
    expect(html).toContain("<svg"); // the arrow icon
  });

  it("renders cards as an auto-fit grid without cols", async () => {
    expect(await render("!!! cards\n    - one\n    - two\n")).toContain("auto-fit");
  });

  it("renders an accordion as grouped exclusive-open details", async () => {
    const html = await render(
      "!!! accordion\n    - Q one\n\n      A one\n    - Q two\n\n      A two\n",
    );
    expect(html).toContain('name="docomd-accordion-');
    expect(html).toContain("<details");
    expect(html).toContain("Q one");
    expect(html).toContain("A one");
  });
});

describe("nesting (playground edge cases)", () => {
  it("nests a callout inside a callout", async () => {
    const html = await render("!!! note\n    outer\n\n    !!! warning\n        inner\n");
    expect(html).toContain("border-foreground/20");
    expect(html).toContain("border-amber-500/50");
    expect(html).toContain("inner");
  });

  it("nests three levels deep", async () => {
    const html = await render("!!! note\n    !!! info\n        !!! tip\n            deep\n");
    expect(html).toContain("border-foreground/20");
    expect(html).toContain("border-primary/40");
    expect(html).toContain("border-emerald-500/40");
    expect(html).toContain("deep");
  });

  it("puts a collapsible inside a callout", async () => {
    const html = await render('!!! info\n    intro\n\n    ??? tip "more"\n        hidden\n');
    expect(html).toContain("<details");
    expect(html).toContain("hidden");
  });

  it("nests cards inside a card", async () => {
    const html = await render("!!! cards\n    - outer\n\n        !!! cards\n            - inner\n");
    expect((html.match(/grid gap-4/g) ?? []).length).toBe(2);
    expect(html).toContain("inner");
  });

  it("puts an accordion and a stepper inside cards", async () => {
    const html = await render(
      "!!! cards { cols=2 }\n" +
        "    - **Q & A**\n\n" +
        "        !!! accordion\n" +
        "            - one\n\n" +
        "              answer\n" +
        "    - **Steps**\n\n" +
        "        !!! steps\n" +
        "            1. a\n" +
        "            2. b\n",
    );
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("<details");
    expect(html).toContain("size-7");
    expect(html).toContain("answer");
  });
});

describe("code blocks", () => {
  it("wraps code in a header bar with a select button and a copy button", async () => {
    const html = await render("```ts\nconst x = 1;\n```\n");
    expect(html).toContain("code-block");
    expect(html).toContain("code-header");
    expect(html).toContain("data-code-select");
    expect(html).toContain("data-code-copy");
    expect(html).toContain("shiki");
  });

  it("gives every block shareable line ids, even unnumbered", async () => {
    const html = await render("```ts\nconst x = 1;\nconst y = 2;\n```\n");
    expect(html).toContain('id="__codeline-0-1"');
    expect(html).toContain('id="__codeline-0-2"');
    // Numbered display is opt-in: a plain block does not get the always-on class.
    expect(html).not.toContain("code-linenums");
  });

  it("indexes line ids by fence order across blocks", async () => {
    const html = await render("```ts\na\n```\n\n```ts\nb\n```\n");
    expect(html).toContain('id="__codeline-0-1"');
    expect(html).toContain('id="__codeline-1-1"');
  });

  it("shows the filename from title=", async () => {
    expect(await render('```ts title="hooks.server.ts"\nx\n```\n')).toContain("hooks.server.ts");
  });

  it("marks highlighted lines from hl_lines", async () => {
    const html = await render('```ts hl_lines="2"\nconst x = 1;\nconst y = 2;\n```\n');
    expect(html).toContain("line-highlight");
  });

  it("enables always-on line numbers from linenums", async () => {
    expect(await render('```ts linenums="1"\nx\n```\n')).toContain("code-linenums");
  });

  it("falls back for unknown grammars but still wraps with a copy button", async () => {
    const html = await render("```doesnotexist\n??\n```\n");
    expect(html).toContain("code-block");
    expect(html).toContain("data-code-copy");
    expect(html).toContain("<pre");
  });
});

describe("content tabs", () => {
  it("renders a consecutive run as a radio-driven set with panels", async () => {
    const html = await render(
      '=== "npm"\n    Install with npm.\n\n=== "pnpm"\n    Install with pnpm.\n',
    );
    expect(html).toContain("tabbed-set");
    expect((html.match(/tabbed-radio/g) ?? []).length).toBe(2);
    expect((html.match(/tabbed-block/g) ?? []).length).toBe(2);
    expect(html).toContain('data-tab-label="npm"');
    expect(html).toContain("Install with pnpm");
  });

  it("checks only the first radio, so the right panel shows before JS (no flash)", async () => {
    const html = await render('=== "a"\n    one\n\n=== "b"\n    two\n');
    expect((html.match(/checked/g) ?? []).length).toBe(1);
  });

  it("renders any tab count (panels are not capped)", async () => {
    let md = "";
    for (let n = 1; n <= 11; n++) md += `=== "t${String(n)}"\n    panel ${String(n)}\n\n`;
    const html = await render(md);
    expect((html.match(/tabbed-block/g) ?? []).length).toBe(11);
  });

  it("renders constructs inside a tab (admonition in a panel)", async () => {
    const html = await render('=== "warn"\n    !!! warning\n        Careful.\n');
    expect(html).toContain("tabbed-set");
    expect(html).toContain("Careful.");
  });

  it("renders a tab inside a card (mutual nesting)", async () => {
    const html = await render(
      '!!! cards\n    - === "x"\n          deep tab\n\n      === "y"\n          other\n',
    );
    expect(html).toContain("tabbed-set");
    expect(html).toContain("deep tab");
  });
});

describe("icon shortcodes", () => {
  it("expands :name: to an inline Lucide icon", async () => {
    const html = await render("Launch :rocket: now.\n");
    expect(html).toContain("<svg");
    expect(html).not.toContain(":rocket:");
  });

  it("leaves non-icon colon text alone", async () => {
    const html = await render("Meet at 3:30, and :notanicon: stays.\n");
    expect(html).toContain("3:30");
    expect(html).toContain(":notanicon:");
  });

  it("does not expand a shortcode inside inline code", async () => {
    expect(await render("Write `:rocket:` literally.\n")).toContain(":rocket:");
  });
});
