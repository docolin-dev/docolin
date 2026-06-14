import { inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import type { DocoFrontmatter } from "./frontmatter-schema";
import type { StoredAuthor } from "./parse";

// Resolves frontmatter authors into their storage shape: `{handle}` entries
// become `{userId}` (looked up in the DB), external entries pass through. A
// handle that isn't a real docolin user is a validation failure (we want
// authors to be real users or explicit external attribution, never silently
// dropped), surfaced so the sync marks the file errored. Server-only (DB).
export type ResolveStoredAuthorsResult =
  | { ok: true; authors: StoredAuthor[] }
  | { ok: false; missing: string[] };

export async function resolveStoredAuthors(
  authors: DocoFrontmatter["authors"],
): Promise<ResolveStoredAuthorsResult> {
  const handles: string[] = [];
  for (const a of authors) {
    if (a.handle !== undefined) handles.push(a.handle);
  }

  const handleToUserId = new Map<string, string>();
  if (handles.length > 0) {
    const found = await db
      .select({ handle: users.handle, id: users.id })
      .from(users)
      .where(inArray(users.handle, handles));
    for (const row of found) handleToUserId.set(row.handle, row.id);

    const missing = handles.filter((h) => !handleToUserId.has(h));
    if (missing.length > 0) return { ok: false, missing };
  }

  const stored: StoredAuthor[] = authors.map((a) => {
    if (a.handle !== undefined) {
      const userId = handleToUserId.get(a.handle);
      // Unreachable: missing handles failed above.
      if (userId === undefined) {
        throw new Error(`internal: handle ${a.handle} missing after resolution`);
      }
      return { userId };
    }
    if (a.name === undefined) {
      // Schema guarantees exactly one of handle or name. Unreachable unless the
      // schema and this branch drift apart.
      throw new Error("internal: author has neither handle nor name");
    }
    const entry: StoredAuthor = { name: a.name };
    if (a.username !== undefined) entry.username = a.username;
    if (a.url !== undefined) entry.url = a.url;
    return entry;
  });

  return { ok: true, authors: stored };
}
