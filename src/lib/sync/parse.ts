import { parse as parseYaml } from "yaml";
import { docoFrontmatterSchema, type DocoFrontmatter } from "./frontmatter-schema";
import { parseTimeEstimate, type TimeEstimateRange } from "./time-estimate";

// Storage-shape author entry. Handles are resolved to userIds at sync time (see
// resolve-authors.ts); external entries are stored exactly as written.
// Discriminated by which fields are present (userId vs name).
export type StoredAuthor = { userId: string } | { name: string; username?: string; url?: string };

export interface ParsedDoco {
  frontmatter: DocoFrontmatter;
  body: string;
  timeEstimate: TimeEstimateRange | null;
  // The original frontmatter object exactly as parsed, before the schema strips
  // unknown keys: the author's fields, their `docolin:` block, and any custom
  // keys. Stored in `versions.frontmatter_extra` so the raw output can replay
  // what the author wrote, kept separate from docolin's computed block.
  frontmatterExtra: Record<string, unknown>;
}

export interface ParseError {
  code: "yaml_parse_error" | "frontmatter_invalid";
  message: string;
  details: Record<string, unknown>;
}

export type ParseResult = { ok: true; parsed: ParsedDoco } | { ok: false; error: ParseError };

// Pure frontmatter + body parse: no DB access, so it runs in the browser (the
// local-folder preview) exactly as at sync time. Resolving author `{handle}`
// entries to userIds is a separate server step (resolve-authors.ts); the local
// preview uses the frontmatter authors directly.
export function parseDocoFile(source: string): ParseResult {
  // 1. Split the `---` fenced frontmatter from the body. Browser-safe (no
  // gray-matter, which pulls in Node's Buffer and crashes in the local preview).
  let fm: { data: unknown; body: string };
  try {
    fm = splitFrontmatter(source);
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
  const schemaResult = docoFrontmatterSchema.safeParse(fm.data);
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

  // 3. Parse the author-written time_estimate string to min/max minutes.
  const timeEstimate =
    frontmatter.docolin.time_estimate !== undefined
      ? parseTimeEstimate(frontmatter.docolin.time_estimate)
      : null;

  return {
    ok: true,
    parsed: {
      frontmatter,
      body: fm.body,
      timeEstimate,
      // safeParse succeeded, so fm.data is a validated object, never a primitive.
      frontmatterExtra: fm.data as Record<string, unknown>,
    },
  };
}

/** Whether the source's frontmatter carries a `docolin` key at all, regardless
 * of validity. The opt-in gate for READMEs: presence of the key (even in a
 * half-written block) opts the file in, so its real validation error surfaces
 * instead of the file silently vanishing. Browser-safe (the local preview
 * applies the same gate client-side). */
export function hasDocolinKey(source: string): boolean {
  try {
    const data = splitFrontmatter(source).data;
    return typeof data === "object" && data !== null && "docolin" in data;
  } catch {
    // splitFrontmatter throws (via parseYaml) on malformed YAML, which can't be
    // prevented without parsing the YAML twice. Fall through to a raw line scan
    // of the fence so a broken-but-intended docolin block still opts in.
  }
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0].trimEnd() !== "---") return false;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trimEnd();
    if (t === "---" || t === "...") break;
    if (lines[i].startsWith("docolin:")) return true;
  }
  return false;
}

// Splits a leading `---` fenced YAML frontmatter block from the body. docolin
// only uses the `---` fence form, so a plain line scan covers it without
// gray-matter. Throws (via parseYaml) on malformed YAML.
function splitFrontmatter(source: string): { data: unknown; body: string } {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source; // strip BOM
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0].trimEnd() !== "---") return { data: {}, body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trimEnd();
    if (t === "---" || t === "...") {
      end = i;
      break;
    }
  }
  if (end === -1) return { data: {}, body: text };
  const yamlText = lines.slice(1, end).join("\n");
  const body = lines.slice(end + 1).join("\n");
  const data: unknown = yamlText.trim() === "" ? {} : parseYaml(yamlText);
  return { data, body };
}
