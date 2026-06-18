import { z } from "zod";
import { isLinkShaped } from "./link";
import { parseTimeEstimate } from "./time-estimate";
import { sitemapSchema } from "./sitemap-schema";

// Validates the raw YAML frontmatter shape exactly as authored. Resolution
// (handle → userId) and normalization (time_estimate → min/max minutes) live
// in the parser; this file only enforces structure.
//
// Mirrors docs/frontmatter-format.md. When that doc changes, this changes.

// ---------- kind path ----------

const RESERVED_KIND_DOMAINS = [
  "os",
  "hardware",
  "software",
  "data",
  "network",
  "security",
  "cloud",
  "devops",
  "programming",
  "tools",
  "blog",
  // Sandbox root: `example/...` kinds are valid and viewable but excluded from
  // search, browse, trending, and crawler indexing (see EXAMPLE_KIND_ROOT). For
  // tutorials and one-off testing, so they never clutter the real taxonomy.
  "example",
] as const;

// The sandbox kind root. A doco whose kind starts with this is published and
// served at its URL (and can be stamped), but excluded from every discovery
// surface: search, browse, trending, the kind tree, embeddings, and crawlers.
export const EXAMPLE_KIND_ROOT = "example";

/** Whether a kind, given as either a dotted ltree path (`example.hello`) or a
 *  slashed display path (`example/hello`), sits under the example sandbox. */
export function isExampleKind(kind: string): boolean {
  let end = kind.length;
  const slash = kind.indexOf("/");
  const dot = kind.indexOf(".");
  if (slash !== -1 && slash < end) end = slash;
  if (dot !== -1 && dot < end) end = dot;
  return kind.slice(0, end) === EXAMPLE_KIND_ROOT;
}

// Per CLAUDE.md 3.8, no regex: explicit char-class check.
function isValidKindSegment(segment: string): boolean {
  if (segment.length === 0) return false;
  for (const c of segment) {
    const ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "_" || c === "-";
    if (!ok) return false;
  }
  return true;
}

const kindPath = z.string().superRefine((value, ctx) => {
  const segments = value.split("/");
  if (segments.length < 2 || segments.length > 5) {
    ctx.addIssue({
      code: "custom",
      message: "kind must be 2 to 5 segments deep",
    });
    return;
  }
  for (const segment of segments) {
    if (!isValidKindSegment(segment)) {
      ctx.addIssue({
        code: "custom",
        message: `segment "${segment}" must be lowercase letters, digits, underscores, or hyphens`,
      });
      return;
    }
  }
  if (!(RESERVED_KIND_DOMAINS as readonly string[]).includes(segments[0])) {
    ctx.addIssue({
      code: "custom",
      message: `first segment must be one of: ${RESERVED_KIND_DOMAINS.join(", ")}`,
    });
  }
});

// ---------- author entry ----------

const authorEntry = z
  .object({
    handle: z.string().optional(),
    name: z.string().optional(),
    username: z.string().optional(),
    url: z.url().optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const hasHandle = entry.handle !== undefined;
    const hasName = entry.name !== undefined;
    if (hasHandle === hasName) {
      ctx.addIssue({
        code: "custom",
        message: "each author must have exactly one of `handle` or `name`",
      });
    }
    if (hasHandle && (entry.username !== undefined || entry.url !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "`username` and `url` are only valid alongside `name`, not `handle`",
      });
    }
  });

// ---------- helpers ----------

const linkField = z.string().refine(isLinkShaped, {
  message: "must be a relative path, absolute path, or external URL",
});

const timeEstimateField = z.string().refine((v) => parseTimeEstimate(v) !== null, {
  message: 'must be a duration like "15m", "1h30m", or "30m-1h"',
});

// ---------- docolin namespaced block ----------

const docolinBlock = z
  .object({
    schema_version: z.literal(1),
    kind: kindPath,
    type: z.enum(["tutorial", "how-to", "reference", "explanation"]),
    applies_to: z.array(z.string()).default([]),
    language: z.string().default("en"),
    difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
    time_estimate: timeEstimateField.optional(),
    status: z.enum(["draft", "stable", "needs-update", "deprecated"]).default("stable"),
    superseded_by: linkField.optional(),
    aliases: z.array(z.string()).default([]),
    references: z.array(z.url()).default([]),
    prev: linkField.optional(),
    next: linkField.optional(),
    sitemap: sitemapSchema.optional(),
  })
  .superRefine((block, ctx) => {
    if (block.status === "deprecated" && !block.superseded_by) {
      ctx.addIssue({
        code: "custom",
        path: ["superseded_by"],
        message: "`superseded_by` is required when `status` is `deprecated`",
      });
    }
  });

// ---------- top-level frontmatter ----------

export const docoFrontmatterSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  authors: z.array(authorEntry).min(1, "at least one author is required"),
  docolin: docolinBlock,
});

export type DocoFrontmatter = z.infer<typeof docoFrontmatterSchema>;
export type FrontmatterAuthorEntry = z.infer<typeof authorEntry>;

export { RESERVED_KIND_DOMAINS };
