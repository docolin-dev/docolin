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
    },
  };
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
