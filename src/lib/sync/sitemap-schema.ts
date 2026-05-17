import { z } from "zod";
import { isLinkShaped } from "./link";

// Sitemap shape used in two places: the per-doco `sitemap:` field in
// frontmatter, and the project-wide `docolin/sitemap.yaml`. Same schema
// for both because Oliver wants them interchangeable.
//
// Each node has a `title`, plus EITHER `url` (leaf) OR `children` (branch),
// never both, never neither. Recursive.

export interface SitemapNode {
  title: string;
  url?: string;
  children?: SitemapNode[];
}

const sitemapNodeBase: z.ZodType<SitemapNode> = z.lazy(() =>
  z
    .object({
      title: z.string().min(1, "title is required"),
      url: z.string().optional(),
      children: z.array(sitemapNodeBase).optional(),
    })
    .strict()
    .superRefine((node, ctx) => {
      const hasUrl = node.url !== undefined;
      const hasChildren = node.children !== undefined;
      if (hasUrl === hasChildren) {
        ctx.addIssue({
          code: "custom",
          message: "each entry must have exactly one of `url` or `children`",
        });
        return;
      }
      if (hasUrl && !isLinkShaped(node.url)) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: "url must be a relative path, absolute path, or external URL",
        });
      }
      if (hasChildren && (node.children ?? []).length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["children"],
          message: "children must be a non-empty list (omit the field for a leaf)",
        });
      }
    }),
);

// The top-level form: either a list of nodes (the actual sitemap) or an
// explicit empty array which signals "no sidebar." Empty file and missing
// file behave the same in v1; they diverge when auto-detection lands.
export const sitemapSchema = z.array(sitemapNodeBase);

// Parsed shape of the global file: { sitemap: [...] }.
export const sitemapFileSchema = z.object({
  sitemap: sitemapSchema,
});

export type Sitemap = z.infer<typeof sitemapSchema>;
