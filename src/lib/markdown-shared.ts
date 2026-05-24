// Client-side composer preview. Builds the same docomd remark/rehype pipeline as
// the server (see $lib/markdown/render), but lazy-imports both the pipeline and
// shiki on first use, so the heavy renderer never ships in the initial bundle and
// never reaches readers (who get server-rendered HTML). Run Lean: the weight only
// hits authors, once, when they open Preview. The shared pipeline guarantees the
// preview matches the published doco.

let preview: ((source: string) => Promise<string>) | null = null;

export async function renderMarkdownPreview(source: string): Promise<string> {
  if (preview === null) {
    const [{ createMarkdownRenderer, SHIKI_THEMES }, { codeToHast }] = await Promise.all([
      import("$lib/markdown/render"),
      import("shiki"),
    ]);
    preview = createMarkdownRenderer((code, lang) =>
      codeToHast(code, { lang, themes: SHIKI_THEMES, defaultColor: false }),
    );
  }
  return preview(source);
}
