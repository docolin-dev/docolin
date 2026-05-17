import { marked, type Tokens } from "marked";
import { createDirectives } from "marked-directive";
import DOMPurify from "isomorphic-dompurify";
import { codeToHtml } from "shiki";

// Universal markdown renderer per spec 4.7. Source of truth (markdown) lives
// in the DB; rendered HTML is computed on read in load functions and cached
// at the edge. Bumping RENDERER_VERSION invalidates every cached page on the
// next read by changing the cache key; no DB backfill needed.
//
// Used by every surface that displays user-authored text (inbox, docos,
// versions, discussions). Keep this the only path that produces HTML so
// upgrades are one-line and consistent everywhere.
//
// Custom directives (the `:::name ... :::` syntax via marked-directive):
//
//   :::btn
//   [Open the org](/dashboard/nvidia)
//   :::
//
//     -> primary-styled CTA button wrapping the link.
//
//   :::info / :::warning / :::danger / :::note / :::tip
//   Some content
//   :::
//
//     -> bordered panel with semantic color. Names match the Docusaurus /
//        Starlight convention so imported docs render correctly with no
//        rewrite step. info = primary tint, warning = amber,
//        danger = destructive tint, note = neutral, tip = emerald.
//
// Standard markdown handles everything else: lists, blockquotes, bold,
// inline code, headings, links, hr.

export const RENDERER_VERSION = "1";

// The `[&>*:first-child]:mt-0 [&>*:last-child]:mb-0` resets pull the prose
// plugin's paragraph margins off the first and last children of the
// callout. Without it, the inner <p> tags carry their normal vertical
// margins inside the callout box, which combined with the callout's own
// padding produces visibly inflated top/bottom space.
const CALLOUT_BASE = "border border-l-4 p-4 my-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

const CALLOUT_CLASSES: Record<string, string> = {
  info: `border-primary/40 bg-primary/5 ${CALLOUT_BASE}`,
  warning: `border-amber-500/40 bg-amber-50 ${CALLOUT_BASE}`,
  danger: `border-destructive/40 bg-destructive/5 ${CALLOUT_BASE}`,
  note: `border-foreground/15 bg-muted/40 ${CALLOUT_BASE}`,
  tip: `border-emerald-500/40 bg-emerald-50 ${CALLOUT_BASE}`,
};

marked.use(
  createDirectives([
    {
      level: "container",
      marker: ":::",
      renderer(token) {
        // marked-directive exposes meta.name (the directive identifier) and
        // tokens (parsed children). Only narrowing here, not asserting,
        // because the package's types are loose around custom directives.
        const t = token as Tokens.Generic & {
          meta?: { name?: string };
          tokens?: Tokens.Generic[];
        };
        const name = t.meta?.name ?? "";
        const inner = this.parser.parse(t.tokens ?? []);

        if (name === "btn") {
          // Strip the wrapping <p> the inner [link](url) becomes so the
          // anchor renders as a standalone button without an extra block.
          const linkOnly = inner.replace(/^<p>\s*/, "").replace(/\s*<\/p>\s*$/, "");
          return `<div class="my-4">${linkOnly.replace(
            /^<a /,
            '<a class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center gap-2 px-5 text-base font-medium no-underline transition-colors" ',
          )}</div>`;
        }

        if (name in CALLOUT_CLASSES) {
          return `<div class="${CALLOUT_CLASSES[name]}">${inner}</div>`;
        }

        return false;
      },
    },
  ]),
);

// Override the default link renderer so external destinations (mailto,
// http, https, anything not starting with "/") open in a new tab with
// noopener for security. Internal app links keep same-tab navigation.
marked.use({
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${title}"` : "";
      const isInternal = href.startsWith("/") || href.startsWith("#");
      const externalAttrs = isInternal ? "" : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${href}"${titleAttr}${externalAttrs}>${text}</a>`;
    },
    // Heading IDs let the doco viewer's TOC scroll-target and direct-link to
    // sections. Same slug function used by extractDocoToc below so IDs in the
    // rendered HTML match the IDs in the TOC entries.
    heading({ tokens, depth }) {
      const inner = this.parser.parseInline(tokens);
      const plain = plainTextFromTokens(tokens);
      const id = slugify(plain);
      return `<h${String(depth)} id="${id}">${inner}</h${String(depth)}>\n`;
    },
  },
});

// Shiki for syntax-highlighted code blocks. The canonical async pattern in
// marked v18: do the async work in `walkTokens` (which marked awaits when
// async is enabled), stash the result on the token, then read it back in a
// SYNC `code` renderer. Trying to put an async renderer in `marked.use`
// produced "[object Promise]" output even with async: true everywhere set.
//
// github-light matches docolin's light-only theme; unknown grammars fall
// back to a plain escaped pre/code block.

interface ShikiCachedToken extends Tokens.Code {
  shikiHtml?: string;
}

function escapeForPre(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

marked.use({
  async: true,
  async walkTokens(token) {
    if (token.type !== "code") return;
    const t = token as ShikiCachedToken;
    const lang = t.lang === undefined || t.lang === "" ? "text" : t.lang;
    try {
      t.shikiHtml = await codeToHtml(t.text, { lang, theme: "github-light" });
    } catch {
      t.shikiHtml = `<pre><code>${escapeForPre(t.text)}</code></pre>`;
    }
  },
  renderer: {
    code(token) {
      const t = token as ShikiCachedToken;
      if (typeof t.shikiHtml === "string") return t.shikiHtml;
      // Fallback: walkTokens didn't run for some reason (defensive).
      return `<pre><code>${escapeForPre(t.text)}</code></pre>`;
    },
  },
});

marked.setOptions({
  gfm: true,
  breaks: false,
  // Async mode must be set at the options level too, not just via
  // marked.use({ async: true }), or async renderer overrides return
  // Promises that get stringified as "[object Promise]" in the output.
  async: true,
});

export async function renderMarkdown(source: string): Promise<string> {
  // Pass async: true at the call site as well to belt-and-suspenders the
  // async behavior: marked v18 has been known to drop the global flag
  // in some renderer-extension combinations.
  const rawHtml = await marked.parse(source, { async: true });
  return DOMPurify.sanitize(rawHtml, {
    // Directive renderers emit Tailwind classes on inserted div/a, the
    // heading renderer emits id="" for TOC scroll-targeting, and shiki
    // emits inline style="color: ..." on code spans for syntax colors.
    ADD_ATTR: ["class", "target", "rel", "id", "style"],
  });
}

// ---------- TOC extraction for the doco viewer ----------

export interface TocEntry {
  // Heading depth: 2, 3, or 4 in practice. Kept as plain `number` because
  // marked's heading token types `depth` as `number` and narrowing to a
  // literal union via !== checks doesn't propagate cleanly.
  level: number;
  text: string;
  id: string;
}

// Walks the markdown source via marked.lexer and pulls h2 and h3 headings.
// h1 is excluded since the page already shows the doco title separately;
// h4+ is excluded to keep the TOC focused on the structural skeleton.
export function extractDocoToc(source: string): TocEntry[] {
  const tokens = marked.lexer(source);
  const out: TocEntry[] = [];
  for (const t of tokens) {
    if (t.type !== "heading") continue;
    const depth = Number(t.depth);
    if (depth !== 2 && depth !== 3) continue;
    const text = plainTextFromTokens(t.tokens);
    out.push({
      level: depth,
      text,
      id: slugify(text),
    });
  }
  return out;
}

// Flattens inline tokens to plain text. Used for both heading IDs (where
// we don't want markdown markup in the id) and TOC labels (where we want
// the reader-visible text, not the source syntax).
//
// Parameter is `unknown` rather than marked's `Tokens.Generic[]` because
// Generic has a `[key:string]: any` index signature that pollutes
// downstream type inference with any. Narrowing locally keeps the rest of
// the file type-safe.
function plainTextFromTokens(tokens: unknown): string {
  if (!Array.isArray(tokens)) return "";
  let out = "";
  for (const t of tokens) {
    if (typeof t !== "object" || t === null) continue;
    const obj = t as Record<string, unknown>;
    if (Array.isArray(obj.tokens)) {
      out += plainTextFromTokens(obj.tokens);
      continue;
    }
    if (typeof obj.text === "string") out += obj.text;
  }
  return out;
}

// CLAUDE.md 3.8: no regex. Char-by-char slug: lowercase alphanumerics survive,
// spaces/dashes/underscores become single dashes, everything else dropped.
function slugify(text: string): string {
  let out = "";
  let lastWasDash = false;
  for (const c of text.toLowerCase()) {
    if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) {
      out += c;
      lastWasDash = false;
    } else if (c === " " || c === "-" || c === "_") {
      if (!lastWasDash && out.length > 0) {
        out += "-";
        lastWasDash = true;
      }
    }
  }
  while (out.endsWith("-")) out = out.slice(0, -1);
  return out;
}
