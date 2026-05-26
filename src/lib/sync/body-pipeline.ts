import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkStringify from "remark-stringify";
import { remarkDocomd, admonitionToMarkdown, tabToMarkdown } from "$lib/markdown/docomd";
import { visit } from "unist-util-visit";
import pLimit from "p-limit";
import type { Plugin } from "unified";
import type { Root, Image, Link } from "mdast";

// Converts a doco's raw body markdown into the canonical stored form. Runs at
// sync time. Pure body in, pure body out, frontmatter is split off upstream
// by the parser.
//
// The pipeline is a small set of remark plugins. Adding behavior means adding
// a plugin, not editing this file's stringify step. Future plugins (admonition
// normalization, soft-link annotation) drop in as additional stages.

export interface BodyPipelineOptions {
  // Maps a body image URL (source-repo-relative, or already absolute) to its
  // final URL. Returning the input unchanged means "don't rewrite." Image
  // archival to R2 happens inside this callback.
  rewriteImageUrl: (sourceUrl: string) => Promise<string>;

  // Maps a relative .md/.mdx link to its destination docolin URL. Only invoked
  // for links that look like relative markdown references; everything else passes
  // through unchanged.
  rewriteRelativeLink: (sourceUrl: string) => string;

  // Maps a Mintlify root-absolute doc link (`/devtools/mcp`, relative to the docs
  // root) to its docolin URL. Only set for Mintlify imports; omitted for docolin
  // repos, where a leading `/` is a soft kind link or an intentional path.
  rewriteAbsoluteLink?: (sourceUrl: string) => string;

  // Max concurrent image rewrites. Defaults to 8 (matches the sync engine's
  // overall jsDelivr/R2 budget).
  imageConcurrency?: number;
}

function isRelativeMarkdownLink(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return false;
  if (trimmed.startsWith("mailto:")) return false;
  if (trimmed.startsWith("#")) return false;
  if (trimmed.startsWith("/")) return false;
  return trimmed.endsWith(".md") || trimmed.endsWith(".mdx");
}

// A root-absolute internal doc link (`/devtools/mcp`), as Mintlify authors them.
// Excludes protocol-relative (`//host`), anchors, and the bare root.
function isAbsoluteDocLink(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/#")) return false;
  return trimmed.length > 1;
}

function imageRewritePlugin(opts: BodyPipelineOptions): Plugin<[], Root> {
  const limit = pLimit(opts.imageConcurrency ?? 8);
  return () => async (tree) => {
    const nodes: Image[] = [];
    visit(tree, "image", (node) => {
      nodes.push(node);
    });
    await Promise.all(
      nodes.map((node) =>
        limit(async () => {
          node.url = await opts.rewriteImageUrl(node.url);
        }),
      ),
    );
  };
}

function linkRewritePlugin(opts: BodyPipelineOptions): Plugin<[], Root> {
  return () => (tree) => {
    visit(tree, "link", (node: Link) => {
      if (isRelativeMarkdownLink(node.url)) {
        node.url = opts.rewriteRelativeLink(node.url);
      } else if (opts.rewriteAbsoluteLink !== undefined && isAbsoluteDocLink(node.url)) {
        node.url = opts.rewriteAbsoluteLink(node.url);
      }
    });
  };
}

// Registers the docomd serializers so remark-stringify writes admonition and tab
// nodes back to their `!!!` / `===` source. remarkGfm and remarkMath cover the
// table / footnote / math serializers. All of these are needed because admonition
// and tab bodies are re-parsed with gfm + math (see admonition-mdast.ts), so the
// stringify side must handle every node those bodies can contain, or an inline
// `$x$` in a callout throws "Cannot handle unknown node inlineMath". Mirrors the
// prettier-docomd printer, which round-trips the same nodes.
const docomdToMarkdown: Plugin<[], Root> = function (): undefined {
  const data = this.data();
  const toMarkdownExtensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = []);
  toMarkdownExtensions.push(admonitionToMarkdown(), tabToMarkdown());
};

export async function convertBody(body: string, options: BodyPipelineOptions): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDocomd)
    .use(docomdToMarkdown)
    .use(imageRewritePlugin(options))
    .use(linkRewritePlugin(options))
    .use(remarkStringify, {
      // Keep output stable + readable. Defaults are mostly fine; pin a few
      // choices so the canonical form doesn't drift between unified upgrades.
      bullet: "-",
      emphasis: "_",
      fences: true,
      listItemIndent: "one",
      rule: "-",
      ruleSpaces: false,
    });

  const file = await processor.process(body);
  return String(file);
}
