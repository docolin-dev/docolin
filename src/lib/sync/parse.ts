import { parse as parseYaml } from "yaml";
import { docoFrontmatterSchema, type DocoFrontmatter } from "./frontmatter-schema";
import { parseTimeEstimate, type TimeEstimateRange } from "./time-estimate";
import { LIMITS } from "$lib/limits";

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

// The Mintlify-import gap, shared by the sync's error record (process-file.ts)
// and the preview's checklist so the guidance can never drift between them:
// the page converts fine but hasn't been given docolin frontmatter yet.
export const MINTLIFY_FRONTMATTER_REQUIRED = {
  code: "mintlify_frontmatter_required",
  message:
    "Imported from Mintlify. Add docolin frontmatter to this page: an `authors` list (at least one) and a `docolin:` block with `kind` and `type`.",
} as const;

export interface ParseError {
  // The parser codes, plus the shared Mintlify-import code above, which
  // the local preview reports through this same shape.
  code:
    | "yaml_parse_error"
    | "frontmatter_invalid"
    | "mintlify_frontmatter_required"
    | "file_too_large";
  message: string;
  details: Record<string, unknown>;
}

export type ParseResult = { ok: true; parsed: ParsedDoco } | { ok: false; error: ParseError };

/** The size-limit violation for a doco source, or null if it fits. Shared by
 *  parseDocoFile (which covers the preview) and the sync's validateFile, which
 *  checks BEFORE the Mintlify conversion so an oversized file can't burn CPU
 *  converting first. Bytes, not string length: storage and transfer see bytes,
 *  and UTF-8 can be up to 3x the UTF-16 code-unit count. */
export function checkDocoSourceSize(source: string): ParseError | null {
  const sourceBytes = new TextEncoder().encode(source).length;
  if (sourceBytes <= LIMITS.docoSourceBytes) return null;
  const toKb = (n: number): number => Math.round(n / 1024);
  return {
    code: "file_too_large",
    message: `File is ${String(toKb(sourceBytes))} KB; docolin accepts doco sources up to ${String(toKb(LIMITS.docoSourceBytes))} KB. Split the page into smaller docos.`,
    details: { sourceBytes, limitBytes: LIMITS.docoSourceBytes },
  };
}

// Pure frontmatter + body parse: no DB access, so it runs in the browser (the
// local-folder preview) exactly as at sync time. Resolving author `{handle}`
// entries to userIds is a separate server step (resolve-authors.ts); the local
// preview uses the frontmatter authors directly.
export function parseDocoFile(source: string): ParseResult {
  // 0. Bound the accepted size before any parsing work.
  const sizeError = checkDocoSourceSize(source);
  if (sizeError !== null) return { ok: false, error: sizeError };

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
  const { fence, yamlText } = splitRawFrontmatter(source);
  if (fence === null) {
    // An UNCLOSED fence still signals intent: the author opened frontmatter
    // and saved before closing it. Scan those would-be frontmatter lines so a
    // docolin key in them opts in (and surfaces its real error) instead of the
    // file vanishing. A file with no fence at all stays opted out.
    const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    const lines = text.split("\n");
    if (lines.length === 0 || lines[0].trimEnd() !== "---") return false;
    for (const line of lines.slice(1)) {
      if (line.startsWith("docolin:")) return true;
    }
    return false;
  }
  try {
    const data: unknown = yamlText.trim() === "" ? {} : parseYaml(yamlText);
    return typeof data === "object" && data !== null && "docolin" in data;
  } catch {
    // parseYaml throws on malformed YAML, which can't be prevented without
    // parsing it twice. Fall through to a raw line scan of the fence so a
    // broken-but-intended docolin block still opts in.
  }
  for (const line of yamlText.split("\n")) {
    if (line.startsWith("docolin:")) return true;
  }
  return false;
}

/** String-level split of a leading `---` fenced frontmatter block: the verbatim
 * fence (both delimiter lines included, null when there is none), its inner
 * YAML text, and the body. No YAML parsing, so callers that must keep the raw
 * text (the Mintlify converter) and callers that parse (below) share the ONE
 * delimiter scan; a fence-handling fix lands in both. Browser-safe. */
export function splitRawFrontmatter(source: string): {
  fence: string | null;
  yamlText: string;
  body: string;
} {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source; // strip BOM
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0].trimEnd() !== "---") {
    return { fence: null, yamlText: "", body: text };
  }
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trimEnd();
    if (t === "---" || t === "...") {
      return {
        fence: lines.slice(0, i + 1).join("\n"),
        yamlText: lines.slice(1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
      };
    }
  }
  return { fence: null, yamlText: "", body: text };
}

// Splits a leading `---` fenced YAML frontmatter block from the body. docolin
// only uses the `---` fence form, so a plain line scan covers it without
// gray-matter. Throws (via parseYaml) on malformed YAML.
function splitFrontmatter(source: string): { data: unknown; body: string } {
  const { fence, yamlText, body } = splitRawFrontmatter(source);
  if (fence === null) return { data: {}, body };
  const data: unknown = yamlText.trim() === "" ? {} : parseYaml(yamlText);
  return { data, body };
}
