import { describe, it, expect } from "bun:test";
import { highlightCode } from "$lib/markdown/highlight";
import { createMarkdownRenderer, extractToc } from "./index.ts";

// Render with the shared production highlighter (JS regex engine, dual-theme),
// the same one the server and the composer preview inject. These pin the HTML
// the doco viewer's CSS depends on, and the code-block assertions double as a
// canary: if highlighting ever degrades to the plain fallback again, the
// "shiki"-class checks go red instead of shipping silently.
const render = createMarkdownRenderer(highlightCode);

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

describe("expected-output box", () => {
  it("renders a green fieldset + legend with the default label and no icon", async () => {
    const html = await render("!!! output\n    Server running on port 3000\n");
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain("border-emerald-500/50");
    expect(html).toContain("Expected Output"); // default label
    expect(html).toContain("Server running on port 3000");
    expect(html).not.toContain("<svg"); // no callout icon, unlike a callout
  });

  it("uses the admonition title as the output label", async () => {
    const html = await render('!!! output "Server response"\n    200 OK\n');
    expect(html).toContain("Server response");
    expect(html).not.toContain("Expected Output");
  });

  it("wraps arbitrary markdown, not only code", async () => {
    const html = await render("!!! output\n    - one\n    - two\n");
    expect(html).toContain("<fieldset");
    expect(html).toContain("<li>");
  });

  it("recolors the border and label from { type=<callout> }", async () => {
    const html = await render("!!! output { type=warning }\n    heads up\n");
    expect(html).toContain("border-amber-500/50"); // warning palette border
    expect(html).not.toContain("border-emerald-500/50"); // not the default green
  });
});

describe("inline color swatches + copy", () => {
  it("tags a hex color as a copyable swatch carrying its data-color", async () => {
    const html = await render("Brand `#76b900` green.\n");
    expect(html).toContain("doco-swatch");
    expect(html).toContain('data-color="#76b900"');
    expect(html).toContain("doco-copy"); // swatches are copyable
  });

  it("tags a functional color too", async () => {
    const html = await render("Try `oklch(0.7 0.15 145)` here.\n");
    expect(html).toContain("doco-swatch");
    expect(html).toContain("data-color");
  });

  it("leaves non-color inline code alone", async () => {
    const html = await render("Run `npm install` now.\n");
    expect(html).not.toContain("doco-swatch");
    expect(html).toContain("<code");
  });

  it("makes inline code copyable with a { .copy } attr list, consuming the marker", async () => {
    const html = await render("Run `npm install`{ .copy } now.\n");
    expect(html).toContain("doco-copy");
    expect(html).not.toContain("{ .copy }");
    expect(html).toContain("now."); // trailing text preserved
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

  it("attaches an attr-list class to an image (light/dark variants) and strips the attr text", async () => {
    const html = await render(
      "![Light](/a-light.png){ .light-only }\n\n![Dark](/a-dark.png){ .dark-only }\n",
    );
    expect(html).toContain('class="light-only"');
    expect(html).toContain('class="dark-only"');
    expect(html).toContain('src="/a-light.png"');
    expect(html).not.toContain("{ .light-only }");
    expect(html).not.toContain("{ .dark-only }");
  });

  it("keeps a blob: image src (local preview) but strips a blob: link href", async () => {
    const html = await render("![shot](blob:https://x/abc)\n\n[a](blob:https://x/def)\n");
    expect(html).toContain('src="blob:https://x/abc"');
    expect(html).not.toContain("blob:https://x/def");
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
  it("floats the action buttons on an untitled block (no header bar)", async () => {
    const html = await render("```ts\nconst x = 1;\n```\n");
    expect(html).toContain("code-block");
    expect(html).toContain("code-actions"); // floating, not a header bar
    expect(html).not.toContain("code-header");
    expect(html).toContain("data-code-select");
    expect(html).toContain("data-code-copy");
    expect(html).toContain("shiki");
  });

  it("uses a header bar (not floating buttons) when title= is set", async () => {
    const html = await render('```ts title="x.ts"\nconst x = 1;\n```\n');
    expect(html).toContain("code-header");
    expect(html).toContain("x.ts");
    expect(html).not.toContain("code-actions");
    expect(html).toContain("data-code-copy");
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

  it("starts numbering at the given linenums value and sizes the gutter", async () => {
    const html = await render('```ts linenums="42"\nconst a = 1;\nconst b = 2;\n```\n');
    expect(html).toContain('data-line-start="42"');
    expect(html).toContain("--line-start:41"); // counter offset, so the first line shows 42
    expect(html).toContain("--line-digits:2"); // spans 42..43, two digits wide
  });

  it("rejects a non-positive linenums start, falling back to 1", async () => {
    const html = await render('```ts linenums="-5"\nx\n```\n');
    expect(html).toContain('data-line-start="1"');
  });

  it("falls back for unknown grammars but still wraps with a copy button", async () => {
    const html = await render("```doesnotexist\n??\n```\n");
    expect(html).toContain("code-block");
    expect(html).toContain("data-code-copy");
    expect(html).toContain("<pre");
  });

  it("highlights a git-style ```diff block via shiki (not the plain fallback)", async () => {
    const html = await render("```diff\n-const old = 1;\n+const next = 2;\n```\n");
    expect(html).toContain("code-block");
    expect(html).toContain("shiki"); // known grammar, so shiki coloring, not fallback
    expect(html).toContain("const old = 1;");
    expect(html).toContain("const next = 2;");
  });
});

describe("auto-diff (!!! diff)", () => {
  it("renders a diff figure with a mount canvas and both source blocks kept", async () => {
    const html = await render(
      '!!! diff "Change the threshold"\n' +
        "    ```ts\n    const t = 1;\n    ```\n\n" +
        "    ```ts\n    const t = 2;\n    ```\n",
    );
    expect(html).toContain("doco-diff");
    expect(html).toContain("data-doco-diff");
    expect(html).toContain('data-diff-lang="ts"');
    expect(html).toContain("doco-diff-canvas"); // client mount slot
    expect(html).toContain("doco-diff-source"); // fallback source
    expect((html.match(/code-block/g) ?? []).length).toBe(2); // both blocks kept
    expect(html).toContain("Change the threshold"); // figcaption title
    expect(html).toContain(">Before<"); // fallback side labels
    expect(html).toContain(">After<");
    // shiki tokenizes the code, so assert each block rendered via its line ids
    expect(html).toContain('id="__codeline-0-1"');
    expect(html).toContain('id="__codeline-1-1"');
  });
});

describe("media (video + youtube)", () => {
  it("renders a video-file image as a <video controls>", async () => {
    const html = await render("![clip](https://cdn.example.com/demo.mp4)\n");
    expect(html).toContain("<video");
    expect(html).toContain('src="https://cdn.example.com/demo.mp4"');
    expect(html).toContain("controls");
    expect(html).not.toContain("<img");
  });

  it("leaves a normal image alone", async () => {
    const html = await render("![shot](https://cdn.example.com/pic.png)\n");
    expect(html).toContain("<img");
    expect(html).not.toContain("<video");
  });

  it("turns a youtube image into a thumbnail facade, no iframe", async () => {
    const html = await render("![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n");
    expect(html).toContain("doco-youtube");
    expect(html).toContain('data-yt-id="dQw4w9WgXcQ"');
    expect(html).toContain("i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"); // lazy thumbnail
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("<iframe"); // no player / cookies until the reader clicks
  });

  it("puts the image alt text into the facade's screen-reader label", async () => {
    const html = await render("![Big Buck Bunny](https://youtu.be/dQw4w9WgXcQ)\n");
    expect(html).toContain("Play the YouTube video: Big Buck Bunny");
  });

  it("leaves a youtube link (not an image) as a plain link", async () => {
    const html = await render("Watch [this](https://youtu.be/dQw4w9WgXcQ) later.\n");
    expect(html).toContain('href="https://youtu.be/dQw4w9WgXcQ"');
    expect(html).not.toContain("doco-youtube");
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

describe("math (LaTeX)", () => {
  it("renders inline math with KaTeX (HTML + MathML)", async () => {
    const html = await render("Energy $E = mc^2$ here.\n");
    expect(html).toContain('class="katex"');
    expect(html).toContain("<math"); // MathML for accessibility
  });

  it("renders block math as a centered display block", async () => {
    expect(await render("$$\n\\int_0^1 x \\, dx\n$$\n")).toContain("katex-display");
  });

  it("renders math inside a callout", async () => {
    const html = await render("!!! note\n    The sum $\\sum_k k$ matters.\n");
    expect(html).toContain("border-foreground/20");
    expect(html).toContain("katex");
  });
});

describe("mermaid", () => {
  it("emits a .mermaid element with the raw source, not a shiki code block", async () => {
    const html = await render("```mermaid\ngraph TD\n  A --> B\n```\n");
    expect(html).toContain('class="mermaid');
    expect(html).toContain("graph TD");
    expect(html).not.toContain("shiki");
    expect(html).not.toContain("code-block");
  });
});

describe("charts", () => {
  it("promotes a table with a trailing { .chart } into a chart figure, keeping the table", async () => {
    const html = await render(
      '| Month | Desktop | Mobile |\n| - | - | - |\n| Jan | 186 | 80 |\n\n{ .chart type=bar title="Users" }\n',
    );
    expect(html).toContain('data-doco-chart="bar"');
    expect(html).toContain("<figure");
    expect(html).toContain("doco-chart-canvas"); // reserved mount slot (no layout shift)
    expect(html).toContain("data-chart-copy"); // copy-as-Markdown button
    expect(html).toContain("<table"); // data table preserved as the source
    expect(html).toContain("sr-only"); // table hidden once the chart mounts
    expect(html).toContain("186"); // real data still in the table
    expect(html).toContain("<figcaption"); // title
    expect(html).toContain("Users");
    expect(html).not.toContain("{ .chart"); // marker paragraph consumed
  });

  it("leaves a normal table untouched", async () => {
    const html = await render("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(html).toContain("<table");
    expect(html).not.toContain("doco-chart");
  });

  it("falls back to a bar chart for an unknown type", async () => {
    const html = await render("| x | y |\n| - | - |\n| a | 1 |\n\n{ .chart type=wat }\n");
    expect(html).toContain('data-doco-chart="bar"');
  });
});

describe("charts nested in other constructs", () => {
  it("promotes a chart inside a callout body", async () => {
    const html = await render(
      '!!! tip "Stats"\n    | a | b |\n    | - | - |\n    | 1 | 2 |\n\n    { .chart type=donut }\n',
    );
    expect(html).toContain('data-doco-chart="donut"');
    expect(html).toContain("doco-chart-canvas");
  });

  it("promotes a chart inside a tab panel", async () => {
    const html = await render(
      '=== "One"\n    | a | b |\n    | - | - |\n    | 1 | 2 |\n\n    { .chart type=line }\n',
    );
    expect(html).toContain('data-doco-chart="line"');
  });
});

describe("charts edge cases", () => {
  it("ignores a { .chart } marker with no preceding table", async () => {
    const html = await render("Just a paragraph.\n\n{ .chart type=bar }\n");
    expect(html).not.toContain("doco-chart");
  });

  it("does not promote a table whose trailing attr-list lacks .chart", async () => {
    const html = await render("| a | b |\n| - | - |\n| 1 | 2 |\n\n{ .other }\n");
    expect(html).toContain("<table");
    expect(html).not.toContain("doco-chart");
  });

  it("carries stacked + horizontal flags through to data attributes", async () => {
    const html = await render(
      "| q | a | b |\n| - | - | - |\n| 1 | 2 | 3 |\n\n{ .chart type=bar stacked horizontal }\n",
    );
    expect(html).toContain('data-doco-chart="bar"');
    expect(html).toContain("data-stacked");
    expect(html).toContain("data-horizontal");
  });

  it("promotes a chart inside an accordion row", async () => {
    const html = await render(
      "!!! accordion\n    - **Q**\n\n      | a | b |\n      | - | - |\n      | 1 | 2 |\n\n      { .chart type=area }\n",
    );
    expect(html).toContain('data-doco-chart="area"');
  });

  it("promotes a chart inside a card", async () => {
    const html = await render(
      "!!! cards\n    - **A card**\n\n      | a | b |\n      | - | - |\n      | 1 | 2 |\n\n      { .chart type=line }\n",
    );
    expect(html).toContain('data-doco-chart="line"');
  });
});

describe("footnotes", () => {
  it("renders gfm footnote references and a footnotes section", async () => {
    const html = await render("A claim.[^1]\n\n[^1]: The source.\n");
    expect(html).toContain("data-footnote-ref"); // inline marker (hover-preview hook)
    expect(html).toContain('class="footnotes"'); // bottom section
    expect(html).toContain("The source.");
  });
});

describe("interactive variables", () => {
  const CARD =
    '!!! inputs "Your setup"\n' +
    '    - api_key: API key { secret placeholder="sk-..." }\n' +
    "    - port: Port { type=number default=8080 }\n" +
    '    - endpoint := "https://h:" + port\n';

  it("renders the card with its declarations payload and fallback", async () => {
    const html = await render(CARD);
    expect(html).toContain("data-doco-inputs");
    expect(html).toContain("Your setup");
    expect(html).toContain("doco-inputs-canvas");
    expect(html).toContain("doco-inputs-fallback");
    // The JSON payload carries the parsed declarations for the client mount.
    expect(html).toContain("data-inputs-card=");
    expect(html).toContain("api_key");
    expect(html).toContain("{{ api_key }}"); // fallback shows the convention
  });

  it("tags declared expressions in prose and leaves undeclared ones literal", async () => {
    const html = await render(`${CARD}\nUse {{ port }} or {{ port * 2 }} but not {{ nope }}.\n`);
    expect(html).toContain('data-expr="port"');
    expect(html).toContain('data-expr="port * 2"');
    expect(html).not.toContain('data-expr="nope"');
    expect(html).toContain("{{ nope }}"); // stays literal text
  });

  it("splices markers into highlighted code but never into foreign template syntax", async () => {
    const html = await render(
      `${CARD}\n\`\`\`bash\ncurl {{ endpoint }} # not {{ .Values.x }}\n\`\`\`\n`,
    );
    expect(html).toContain('data-expr="endpoint"');
    expect(html).toContain("{{ .Values.x }}"); // Helm stays literal
    expect(html).not.toContain('data-expr=".Values.x"');
  });

  it("respects a fence's novars opt-out", async () => {
    const html = await render(`${CARD}\n\`\`\`bash novars\necho {{ port }}\n\`\`\`\n`);
    expect(html).not.toContain('data-expr="port"');
  });

  it("does nothing at all in a doc with no inputs card", async () => {
    const html = await render("Just {{ port }} here.\n");
    expect(html).not.toContain("doco-var");
    expect(html).toContain("{{ port }}");
  });

  it("parses a card nested inside another admonition (Rendered boxes in docs)", async () => {
    const html = await render(
      '!!! output "Rendered"\n' +
        '    !!! inputs "Nested"\n' +
        "        - port: Port { type=number default=8080 }\n" +
        '        - address := "host:" + port\n' +
        "\n" +
        "Use {{ address }} here.\n",
    );
    expect(html).toContain('data-expr="address"');
    expect(html).toContain('"name":"port"'.replaceAll('"', "&#x22;"));
    expect(html).not.toContain("invalid variable name");
  });

  it("shares one namespace across cards and reports cross-card redeclarations", async () => {
    const html = await render(
      '!!! inputs "One"\n    - port: Port { type=number default=1 }\n\n' +
        '!!! inputs "Two"\n    - port: Port again\n    - height: Height\n\n' +
        "Use {{ port + 1 }} and {{ height }}.\n",
    );
    expect(html).toContain('data-expr="port + 1"'); // declared in card one, used after card two
    expect(html).toContain('data-expr="height"');
    expect(html).toContain("already declared in another inputs card");
  });

  it("surfaces author mistakes in the card payload, not as breakage", async () => {
    const html = await render("!!! inputs\n    - bad-name: Label\n    - port: Port\n");
    expect(html).toContain("invalid variable name");
    expect(html).toContain("data-doco-inputs");
  });
});

describe("code annotations", () => {
  it("turns (N) markers into buttons when a matching list follows", async () => {
    const html = await render(
      "```bash\nrun it  # (1)\nstop it  # (2)\n```\n\n1. starts\n2. stops\n",
    );
    expect(html).toContain("code-annotation"); // the badge button
    expect(html).toContain('data-annotation-ref="ca-0-1"');
    expect(html).toContain("code-annotations"); // the panel (popover source)
    expect(html).toContain('id="ca-0-1"');
    expect(html).toContain('id="ca-0-2"');
  });

  it("leaves a normal list after a code block alone", async () => {
    const html = await render("```bash\nrun\n```\n\n1. just a list item\n");
    expect(html).not.toContain("code-annotation");
  });

  it("does not treat a function call like foo(1) as a marker", async () => {
    const html = await render("```js\nfoo(1);\n```\n\n1. a note\n");
    expect(html).not.toContain("code-annotation");
  });

  it("hides the annotation list (revealed via the popover, kept for screen readers)", async () => {
    const html = await render("```bash\nrun  # (1)\n```\n\n1. note\n");
    expect(html).toContain("sr-only"); // list is in the DOM but visually hidden
  });

  it("strips the comment with the (N)! variant", async () => {
    const html = await render("```text\nfoo # (1)!\n```\n\n1. note\n");
    expect(html).toContain("code-annotation"); // badge present
    expect(html).not.toContain("(1)"); // marker text consumed
    expect(html).not.toContain("foo #"); // the comment delimiter stripped, badge stands alone
  });
});

describe("footnote reference edge cases", () => {
  // Count non-overlapping occurrences without a regex (project rule).
  const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

  it("supports the same footnote referenced more than once", async () => {
    const html = await render("First.[^1] Second.[^1]\n\n[^1]: Shared note.\n");
    expect(count(html, "data-footnote-ref")).toBe(2); // two markers
    expect(count(html, 'href="#user-content-fn-1"')).toBe(2); // both point at one definition
  });

  it("handles a footnote whose definition references another footnote", async () => {
    const html = await render("Claim.[^a]\n\n[^a]: See also [^b].\n[^b]: The nested note.\n");
    expect(html).toContain("user-content-fn-a");
    expect(html).toContain("user-content-fn-b");
    expect(html).toContain("user-content-fnref-b"); // nested marker lives inside def a
  });
});

describe("annotations anywhere ({ .annotate })", () => {
  it("annotates a prose block tagged with { .annotate }", async () => {
    const html = await render("Some prose (1) here.\n{ .annotate }\n\n1. The note.\n");
    expect(html).toContain("code-annotation"); // the badge
    expect(html).toContain('data-annotation-ref="ca-0-1"');
    expect(html).toContain("code-annotations"); // hidden panel
    expect(html).not.toContain("{ .annotate }"); // attr-list line consumed
  });

  it("leaves plain prose with a (1) alone (no { .annotate })", async () => {
    const html = await render("It costs one dollar (1) only.\n\n1. a list item\n");
    expect(html).not.toContain("code-annotation");
  });

  it("supports a nested annotation (.annotate on a list item)", async () => {
    const html = await render(
      "Outer (1) text.\n{ .annotate }\n\n1.  Inner (1) note.\n    { .annotate }\n\n    1.  Deepest.\n",
    );
    expect(html).toContain('id="ca-0-1"'); // outer annotation item
    expect(html).toContain('id="ca-1-1"'); // nested annotation item
  });
});
