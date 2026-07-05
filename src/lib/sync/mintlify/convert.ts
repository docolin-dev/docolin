import { parse as parseYaml } from "yaml";
import { splitRawFrontmatter } from "../parse";
import { mdxBodyToDocomd } from "./mdx-to-docomd";
import type { MintlifyIconLibrary } from "./detect";

// Turns a Mintlify `.mdx` file into a docolin source file: the MDX body is
// converted to docomd, the frontmatter is kept exactly as the maintainer wrote
// it (verbatim text, comments and key order included). We deliberately do NOT
// manufacture `authors`, `kind`, or `type`; the maintainer adds those (plus they
// keep Mintlify's title/description). docolin's parser then validates the result
// and reports anything missing.
//
// No gray-matter here: it pulls in Node's Buffer and crashes in the browser,
// and the local-folder preview runs this exact conversion client-side. The
// fence scan is shared with parse.ts (splitRawFrontmatter).

/** True when the frontmatter already carries the docolin-required fields, so the
 *  page will pass validation. Used to give a tailored "add these" error instead
 *  of a raw schema dump. */
export function hasDocolinFrontmatter(mdxSource: string): boolean {
  const { fence, yamlText } = splitRawFrontmatter(mdxSource);
  if (fence === null) return false;
  let data: unknown;
  try {
    data = yamlText.trim() === "" ? {} : parseYaml(yamlText);
  } catch {
    // Malformed YAML (parseYaml throws; the only way to know is to parse). It
    // cannot carry a valid docolin block, so the page still needs the fields.
    return false;
  }
  if (data === null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  const docolin = obj.docolin;
  const hasDocolinBlock =
    docolin !== null && typeof docolin === "object" && "kind" in docolin && "type" in docolin;
  const hasAuthors = Array.isArray(obj.authors) && obj.authors.length > 0;
  return hasDocolinBlock && hasAuthors;
}

/** Converts a Mintlify `.mdx` source to a docolin source string (frontmatter +
 *  docomd body), ready for the normal parse + canonicalize pipeline. The icon
 *  library tags card icons with the right set prefix. */
export function mintlifyMdxToDocoSource(
  mdxSource: string,
  iconLibrary: MintlifyIconLibrary,
): string {
  const { fence, body } = splitRawFrontmatter(mdxSource);
  const converted = mdxBodyToDocomd(body, { iconLibrary });
  return fence === null ? converted : `${fence}\n${converted}`;
}
