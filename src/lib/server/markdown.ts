import { marked, type Tokens } from "marked";
import { createDirectives } from "marked-directive";
import DOMPurify from "isomorphic-dompurify";

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
//   :::callout-info / :::callout-warning / :::callout-danger
//   Some content
//   :::
//
//     -> bordered panel with semantic color. info = primary tint,
//        warning = amber, danger = destructive tint.
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

        if (name.startsWith("callout-")) {
          const variant = name.slice("callout-".length);
          const cls = CALLOUT_CLASSES[variant] ?? CALLOUT_CLASSES.info;
          return `<div class="${cls}">${inner}</div>`;
        }

        return false;
      },
    },
  ]),
);

// Override the default link renderer so external destinations (mailto,
// http, https — anything not starting with "/") open in a new tab with
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
  },
});

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(source: string): string {
  const rawHtml = marked.parse(source, { async: false });
  return DOMPurify.sanitize(rawHtml, {
    // Our directive renderers emit Tailwind classes on inserted div/a.
    // Default DOMPurify config strips no attributes from these, but we
    // make the intent explicit so future tightening doesn't break us.
    ADD_ATTR: ["class", "target", "rel"],
  });
}
