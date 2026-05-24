import { codeToHast } from "shiki";
import {
  createMarkdownRenderer,
  extractToc,
  RENDERER_VERSION,
  SHIKI_THEMES,
  type TocEntry,
} from "$lib/markdown/render";

// Server markdown renderer. Builds the docomd remark/rehype pipeline (see
// $lib/markdown/render) with a statically imported shiki highlighter; the client
// composer preview builds the same pipeline but lazy-imports shiki. So the
// published doco and the preview render identically.
//
// Source of truth (markdown) lives in the DB; rendered HTML is computed on read
// in load functions and cached at the edge. Bumping RENDERER_VERSION (in the
// render module) invalidates every cached page on the next read.
//
// Used by every server surface that displays user-authored text (inbox, docos,
// versions, discussions). Keep this the only server path that produces HTML so
// upgrades stay one-line and consistent everywhere.

export { RENDERER_VERSION };
export type { TocEntry };

const render = createMarkdownRenderer((code, lang) =>
  codeToHast(code, { lang, themes: SHIKI_THEMES, defaultColor: false }),
);

export function renderMarkdown(source: string): Promise<string> {
  return render(source);
}

/** Top-level h2/h3 headings for the doco viewer's table of contents. */
export const extractDocoToc = extractToc;
