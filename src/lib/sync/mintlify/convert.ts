import matter from "gray-matter";
import { mdxBodyToDocomd } from "./mdx-to-docomd";
import type { MintlifyIconLibrary } from "./detect";

// Turns a Mintlify `.mdx` file into a docolin source file: the MDX body is
// converted to docomd, the frontmatter is kept exactly as the maintainer wrote
// it. We deliberately do NOT manufacture `authors`, `kind`, or `type`; the
// maintainer adds those (plus they keep Mintlify's title/description). docolin's
// parser then validates the result and reports anything missing.

/** True when the frontmatter already carries the docolin-required fields, so the
 *  page will pass validation. Used to give a tailored "add these" error instead
 *  of a raw schema dump. */
export function hasDocolinFrontmatter(mdxSource: string): boolean {
  const data = matter(mdxSource).data as Record<string, unknown>;
  const docolin = data.docolin;
  const hasDocolinBlock =
    docolin !== null && typeof docolin === "object" && "kind" in docolin && "type" in docolin;
  const hasAuthors = Array.isArray(data.authors) && data.authors.length > 0;
  return hasDocolinBlock && hasAuthors;
}

/** Converts a Mintlify `.mdx` source to a docolin source string (frontmatter +
 *  docomd body), ready for the normal parse + canonicalize pipeline. The icon
 *  library tags card icons with the right set prefix. */
export function mintlifyMdxToDocoSource(
  mdxSource: string,
  iconLibrary: MintlifyIconLibrary,
): string {
  const parsed = matter(mdxSource);
  const body = mdxBodyToDocomd(parsed.content, { iconLibrary });
  // gray-matter re-emits the original frontmatter object as YAML above the body.
  return matter.stringify(body, parsed.data);
}
