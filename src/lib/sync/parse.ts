import matter from "gray-matter";
import { inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { docoFrontmatterSchema, type DocoFrontmatter } from "./frontmatter-schema";
import { parseTimeEstimate, type TimeEstimateRange } from "./time-estimate";

// Storage-shape author entry. Handles are resolved to userIds at parse time;
// external entries are stored exactly as written. Discriminated by which
// fields are present (userId vs name).
export type StoredAuthor = { userId: string } | { name: string; username?: string; url?: string };

export interface ParsedDoco {
  frontmatter: DocoFrontmatter;
  body: string;
  authors: StoredAuthor[];
  timeEstimate: TimeEstimateRange | null;
}

export interface ParseError {
  code: "yaml_parse_error" | "frontmatter_invalid" | "handle_not_found";
  message: string;
  details: Record<string, unknown>;
}

export type ParseResult = { ok: true; parsed: ParsedDoco } | { ok: false; error: ParseError };

export async function parseDocoFile(source: string): Promise<ParseResult> {
  // 1. Split frontmatter from body. gray-matter throws on malformed YAML.
  let split: matter.GrayMatterFile<string>;
  try {
    split = matter(source);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "yaml_parse_error",
        message: err instanceof Error ? err.message : "Failed to parse YAML frontmatter",
        details: {},
      },
    };
  }

  // 2. Validate the parsed object against the docolin frontmatter schema.
  const schemaResult = docoFrontmatterSchema.safeParse(split.data);
  if (!schemaResult.success) {
    return {
      ok: false,
      error: {
        code: "frontmatter_invalid",
        message:
          "Frontmatter doesn't match the required shape. See details for which fields failed.",
        details: {
          issues: schemaResult.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      },
    };
  }

  const frontmatter = schemaResult.data;

  // 3. Resolve `{handle: ...}` author entries to userIds. Missing handles are
  // a validation failure: we want authors to either be real docolin users or
  // explicit external attribution, never silently dropped.
  const handles: string[] = [];
  for (const a of frontmatter.authors) {
    if (a.handle !== undefined) handles.push(a.handle);
  }

  const handleToUserId = new Map<string, string>();
  if (handles.length > 0) {
    const found = await db
      .select({ handle: users.handle, id: users.id })
      .from(users)
      .where(inArray(users.handle, handles));

    for (const row of found) {
      handleToUserId.set(row.handle, row.id);
    }

    const missing: string[] = [];
    for (const h of handles) {
      if (!handleToUserId.has(h)) missing.push(h);
    }
    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          code: "handle_not_found",
          message: `Author handle(s) don't exist on docolin: ${missing.join(", ")}`,
          details: { missingHandles: missing },
        },
      };
    }
  }

  // 4. Build the storage shape of the authors list.
  const authors: StoredAuthor[] = frontmatter.authors.map((a) => {
    if (a.handle !== undefined) {
      const userId = handleToUserId.get(a.handle);
      // Unreachable: handles missing from the map would have failed above.
      if (userId === undefined) {
        throw new Error(`internal: handle ${a.handle} missing after resolution`);
      }
      return { userId };
    }
    if (a.name === undefined) {
      // Schema guarantees exactly one of handle or name is set. Unreachable
      // unless the schema and this branch drift apart.
      throw new Error("internal: author has neither handle nor name");
    }
    const entry: StoredAuthor = { name: a.name };
    if (a.username !== undefined) entry.username = a.username;
    if (a.url !== undefined) entry.url = a.url;
    return entry;
  });

  // 5. Parse the author-written time_estimate string to min/max minutes.
  const timeEstimate =
    frontmatter.docolin.time_estimate !== undefined
      ? parseTimeEstimate(frontmatter.docolin.time_estimate)
      : null;

  return {
    ok: true,
    parsed: {
      frontmatter,
      body: split.content,
      authors,
      timeEstimate,
    },
  };
}
