// Client-side composer preview. Builds the same docomd remark/rehype pipeline as
// the server (see $lib/markdown/render), but lazy-imports both the pipeline and
// shiki on first use, so the heavy renderer never ships in the initial bundle and
// never reaches readers (who get server-rendered HTML). Run Lean: the weight only
// hits authors, once, when they open Preview. The shared pipeline guarantees the
// preview matches the published doco.

let preview: ((source: string, language?: string) => Promise<string>) | null = null;

export async function renderMarkdownPreview(source: string, language?: string): Promise<string> {
  if (preview === null) {
    const [{ createMarkdownRenderer }, { highlightCode }] = await Promise.all([
      import("$lib/markdown/render"),
      import("$lib/markdown/highlight"),
    ]);
    preview = createMarkdownRenderer(highlightCode);
  }
  return preview(source, language);
}
