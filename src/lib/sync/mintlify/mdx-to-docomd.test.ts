import { describe, it, expect } from "bun:test";
import { mdxBodyToDocomd } from "./mdx-to-docomd";

// Each test pins one Mintlify component's conversion to docomd. The output is
// docomd markdown text that the normal sync pipeline then canonicalizes and the
// viewer renders, so asserting on the `!!!` / `===` / attr-list source is enough.

describe("mdxBodyToDocomd", () => {
  it("maps callout components to admonitions", () => {
    expect(mdxBodyToDocomd("<Note>Heads up.</Note>")).toContain("!!! note");
    expect(mdxBodyToDocomd("<Warning>Careful.</Warning>")).toContain("!!! warning");
    expect(mdxBodyToDocomd("<Info>FYI.</Info>")).toContain("!!! info");
    // Check is a green success box; docomd has no success type, so it maps to tip.
    expect(mdxBodyToDocomd("<Check>Done.</Check>")).toContain("!!! tip");
  });

  it("carries a callout title", () => {
    const out = mdxBodyToDocomd('<Note title="Before you begin">Read this.</Note>');
    expect(out).toContain('!!! note "Before you begin"');
    expect(out).toContain("Read this.");
  });

  it("maps Steps/Step to a steps stepper with bold step titles", () => {
    const out = mdxBodyToDocomd(
      '<Steps>\n  <Step title="One">First.</Step>\n  <Step title="Two">Second.</Step>\n</Steps>',
    );
    expect(out).toContain("!!! steps");
    expect(out).toContain("**One**");
    expect(out).toContain("**Two**");
    expect(out).toContain("First.");
  });

  it("maps CardGroup/Card to a cards grid with icon and href", () => {
    const out = mdxBodyToDocomd(
      '<CardGroup cols={2}>\n  <Card title="Use the API" icon="code" href="/api">Build things.</Card>\n</CardGroup>',
    );
    expect(out).toContain("!!! cards { cols=2 }");
    expect(out).toContain("[Use the API](/api){ icon=code }");
    expect(out).toContain("Build things.");
  });

  it("maps a static (no-href) card to a bold title", () => {
    const out = mdxBodyToDocomd('<Card title="Plain" icon="box">Body.</Card>');
    expect(out).toContain("!!! cards");
    expect(out).toContain("**Plain**{ icon=box }");
  });

  it("maps Accordion to a collapsible", () => {
    const out = mdxBodyToDocomd('<Accordion title="How it works">Details.</Accordion>');
    expect(out).toContain('??? note "How it works"');
    expect(out).toContain("Details.");
  });

  it("flattens AccordionGroup into its accordions", () => {
    const out = mdxBodyToDocomd(
      '<AccordionGroup>\n  <Accordion title="A">x</Accordion>\n  <Accordion title="B">y</Accordion>\n</AccordionGroup>',
    );
    expect(out).toContain('??? note "A"');
    expect(out).toContain('??? note "B"');
  });

  it("maps Tabs/Tab to content tabs", () => {
    const out = mdxBodyToDocomd(
      '<Tabs>\n  <Tab title="npm">npm i</Tab>\n  <Tab title="Bun">bun add</Tab>\n</Tabs>',
    );
    expect(out).toContain('=== "npm"');
    expect(out).toContain('=== "Bun"');
  });

  it("maps CodeGroup to code tabs labelled by each block's title", () => {
    const out = mdxBodyToDocomd(
      "<CodeGroup>\n```bash cURL\ncurl x\n```\n\n```ts SDK\nconst x = 1;\n```\n</CodeGroup>",
    );
    expect(out).toContain('=== "cURL"');
    expect(out).toContain('=== "SDK"');
    expect(out).toContain("curl x");
  });

  it("maps theme-duplicated <img> to light/dark image variants", () => {
    const light = mdxBodyToDocomd(
      '<img src="/a-light.png" alt="x" className="block dark:hidden" />',
    );
    expect(light).toContain("![x](/a-light.png){ .light-only }");
    const dark = mdxBodyToDocomd('<img src="/a-dark.png" alt="x" className="hidden dark:block" />');
    expect(dark).toContain("![x](/a-dark.png){ .dark-only }");
  });

  it("summarizes ParamField as a header line plus description", () => {
    const out = mdxBodyToDocomd(
      '<ParamField query="limit" type="integer" default="10">Max items.</ParamField>',
    );
    expect(out).toContain("`limit`");
    expect(out).toContain("`integer`");
    expect(out).toContain("default `10`");
    expect(out).toContain("Max items.");
  });

  it("unwraps an unknown component, keeping its content", () => {
    const out = mdxBodyToDocomd("<Sparkle>kept text</Sparkle>");
    expect(out).toContain("kept text");
    expect(out).not.toContain("Sparkle");
  });

  it("drops MDX noise (comments, expressions, imports)", () => {
    const out = mdxBodyToDocomd("import X from 'y';\n\n{/* a comment */}\n\nReal text.");
    expect(out).toContain("Real text.");
    expect(out).not.toContain("import X");
    expect(out).not.toContain("a comment");
  });

  it("maps an inline <Icon> to the :icon: shortcode, carrying the set prefix", () => {
    // Bare name for lucide / no library (docolin's default resolution).
    expect(mdxBodyToDocomd('Click the <Icon icon="plus" /> button.')).toContain(
      "Click the :plus: button.",
    );
    // The project's icon library rides along exactly like card icons.
    expect(
      mdxBodyToDocomd('Click <Icon icon="download" />.', { iconLibrary: "fontawesome" }),
    ).toContain(":fa-download:");
    expect(mdxBodyToDocomd('Click <Icon icon="download" />.', { iconLibrary: "tabler" })).toContain(
      ":tb-download:",
    );
  });

  it("drops an <Icon> whose name the shortcode would reject", () => {
    const out = mdxBodyToDocomd('Press <Icon icon="Weird Name!" /> now.');
    expect(out).toContain("Press");
    expect(out).toContain("now.");
    expect(out).not.toContain(":");
  });

  it("maps <video> and a YouTube <iframe> to image-as-video syntax", () => {
    expect(mdxBodyToDocomd('<video src="/videos/demo.mp4" title="Demo" />')).toContain(
      "![Demo](/videos/demo.mp4)",
    );
    expect(
      mdxBodyToDocomd('<iframe src="https://www.youtube.com/embed/4KzFe50RQkQ" title="Tour" />'),
    ).toContain("![Tour](https://www.youtube.com/embed/4KzFe50RQkQ)");
  });

  it("drops a non-YouTube iframe (no docomd equivalent)", () => {
    const out = mdxBodyToDocomd('<iframe src="https://example.com/widget" />');
    expect(out.trim()).toBe("");
  });

  it("unwraps <Frame>, converting its media child and keeping the caption", () => {
    const out = mdxBodyToDocomd(
      '<Frame caption="The dashboard">\n  <img src="/images/dash.png" alt="Dashboard" />\n</Frame>',
    );
    expect(out).toContain("![Dashboard](/images/dash.png)");
    expect(out).toContain("_The dashboard_");
    expect(out).not.toContain("Frame");
  });

  it("maps <Tree> to a nested list with the { .tree } marker", () => {
    const out = mdxBodyToDocomd(
      '<Tree>\n  <Tree.Folder name="app" defaultOpen>\n    <Tree.File name="layout.tsx" />\n    <Tree.File name="page.tsx" />\n  </Tree.Folder>\n  <Tree.Folder name="lib"></Tree.Folder>\n  <Tree.File name="package.json" />\n</Tree>',
    );
    expect(out).toContain("- app");
    expect(out).toContain("  - layout.tsx");
    expect(out).toContain("  - page.tsx");
    expect(out).toContain("- lib/"); // empty folder keeps its meaning via the slash
    expect(out).toContain("- package.json");
    expect(out).toContain("{ .tree }");
    expect(out).not.toContain("Tree");
  });

  it("maps bare <Folder>/<File> tree entries too", () => {
    const out = mdxBodyToDocomd(
      '<Tree>\n  <Folder name="src">\n    <File name="main.ts" />\n  </Folder>\n</Tree>',
    );
    expect(out).toContain("- src");
    expect(out).toContain("  - main.ts");
    expect(out).toContain("{ .tree }");
  });
});
