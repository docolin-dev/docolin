import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import pLimit from "p-limit";
import type { Plugin } from "unified";
import type { Root, Image, Link } from "mdast";

// Converts a doco's raw body markdown into the canonical stored form. Runs at
// sync time. Pure body in, pure body out — frontmatter is split off upstream
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

  // Maps a relative .md link to its destination docolin URL. Only invoked for
  // links that look like relative markdown references; everything else passes
  // through unchanged.
  rewriteRelativeLink: (sourceUrl: string) => string;

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
  return trimmed.endsWith(".md");
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
      }
    });
  };
}

export async function convertBody(body: string, options: BodyPipelineOptions): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
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
