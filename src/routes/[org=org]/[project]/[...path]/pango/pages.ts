import matter from "gray-matter";
// Dev-only markdown playground content. Each file is one page; ?raw bundles + watches
// it so editing live-reloads in dev. Shared by the doco viewer's playground branch
// and the link-preview endpoint, so both read one registry. Never reachable in prod.
import pangoWelcome from "./welcome.md?raw";
import pangoText from "./text.md?raw";
import pangoCode from "./code.md?raw";
import pangoTables from "./tables.md?raw";
import pangoMath from "./math.md?raw";
import pangoAdmonitions from "./admonitions.md?raw";
import pangoSteps from "./steps.md?raw";
import pangoCards from "./cards.md?raw";
import pangoAccordion from "./accordion.md?raw";
import pangoTabs from "./tabs.md?raw";
import pangoMermaid from "./mermaid.md?raw";
import pangoCharts from "./charts.md?raw";
import pangoMedia from "./media.md?raw";
import pangoNesting from "./nesting.md?raw";
import pangoCrazy from "./crazy.md?raw";

export interface PangoPage {
  slug: string;
  title: string;
  description: string | null;
  content: string;
}

// Each file is one page; frontmatter is parsed once at module load.
export const PANGO_PAGES: PangoPage[] = [
  { slug: "welcome", raw: pangoWelcome },
  { slug: "text", raw: pangoText },
  { slug: "code", raw: pangoCode },
  { slug: "tables", raw: pangoTables },
  { slug: "math", raw: pangoMath },
  { slug: "admonitions", raw: pangoAdmonitions },
  { slug: "steps", raw: pangoSteps },
  { slug: "cards", raw: pangoCards },
  { slug: "accordion", raw: pangoAccordion },
  { slug: "tabs", raw: pangoTabs },
  { slug: "mermaid", raw: pangoMermaid },
  { slug: "charts", raw: pangoCharts },
  { slug: "media", raw: pangoMedia },
  { slug: "nesting", raw: pangoNesting },
  { slug: "crazy", raw: pangoCrazy },
].map(({ slug, raw }) => {
  const { data, content } = matter(raw);
  const fm = data as Record<string, unknown>;
  return {
    slug,
    title: typeof fm.title === "string" ? fm.title : slug,
    description: typeof fm.description === "string" ? fm.description : null,
    content,
  };
});

// Sectioned sidebar nav, which also exercises the viewer's branch (children)
// rendering. Leaf urls match the page slugs above.
export const PANGO_SITEMAP = [
  { title: "Welcome", url: "/pangos/jungle-gym/welcome" },
  {
    title: "Basics",
    children: [
      { title: "Text & lists", url: "/pangos/jungle-gym/text" },
      { title: "Code blocks", url: "/pangos/jungle-gym/code" },
      { title: "Tables & more", url: "/pangos/jungle-gym/tables" },
      { title: "Math (LaTeX)", url: "/pangos/jungle-gym/math" },
    ],
  },
  {
    title: "Callouts & constructs",
    children: [
      { title: "Admonitions", url: "/pangos/jungle-gym/admonitions" },
      { title: "Steps", url: "/pangos/jungle-gym/steps" },
      { title: "Cards", url: "/pangos/jungle-gym/cards" },
      { title: "Accordion", url: "/pangos/jungle-gym/accordion" },
      { title: "Content tabs", url: "/pangos/jungle-gym/tabs" },
      { title: "Mermaid diagrams", url: "/pangos/jungle-gym/mermaid" },
      { title: "Charts", url: "/pangos/jungle-gym/charts" },
      { title: "Video & embeds", url: "/pangos/jungle-gym/media" },
    ],
  },
  {
    title: "Edge cases",
    children: [
      { title: "Nesting & edge cases", url: "/pangos/jungle-gym/nesting" },
      { title: "Crazy nesting", url: "/pangos/jungle-gym/crazy" },
    ],
  },
];
