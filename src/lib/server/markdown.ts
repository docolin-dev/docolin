import { highlightCode } from "$lib/markdown/highlight";
import {
  createMarkdownRenderer,
  extractToc,
  extractReadingMinutes,
  RENDERER_VERSION,
  type TocEntry,
} from "$lib/markdown/render";

// Server markdown renderer. Builds the docomd remark/rehype pipeline (see
// $lib/markdown/render) with the shared shiki highlighter ($lib/markdown/highlight,
// JS regex engine: WASM cannot compile on the deployed Worker); the client
// composer preview builds the same pipeline from the same modules, lazily. So the
// published doco and the preview render identically.
//
// Source of truth (markdown) lives in the DB; rendered HTML is computed on read
// in load functions and cached at the edge. Bumping RENDERER_VERSION (in the
// render module) invalidates every cached page on the next read.
//
// Used by every server surface that displays user-authored text (inbox, docos,
// versions, discussions). Keep this the only server path that produces HTML so
// upgrades stay one-line and consistent everywhere.

export { RENDERER_VERSION, extractReadingMinutes };
export type { TocEntry };

const render = createMarkdownRenderer(highlightCode);

export function renderMarkdown(source: string, language?: string): Promise<string> {
  return render(source, language);
}

/** Top-level h2/h3 headings for the doco viewer's table of contents. */
export const extractDocoToc = extractToc;
