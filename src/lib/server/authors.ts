import { inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import type { ResolvedAuthor } from "$lib/doco/viewer-data";

// Resolves a version's `authors` jsonb (the frontmatter dual shape: docolin
// user {userId} or external {name, username?, url?}) into display-ready entries.
// Shared by the doco viewer, the raw routes, and the MCP tools so attribution is
// rendered the same everywhere. The ResolvedAuthor type lives in the shared
// viewer-data module (client-safe); re-exported here for existing consumers.
export type { ResolvedAuthor };

export async function resolveAuthors(raw: unknown): Promise<ResolvedAuthor[]> {
  if (!Array.isArray(raw)) return [];

  // First pass: classify and collect userIds for the join.
  const out: ResolvedAuthor[] = [];
  const userIds: string[] = [];
  const userSlots: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.userId === "string") {
      out.push({ kind: "user", userId: obj.userId, handle: "", displayName: null });
      userIds.push(obj.userId);
      userSlots.push(out.length - 1);
    } else if (typeof obj.name === "string") {
      out.push({
        kind: "external",
        name: obj.name,
        username: typeof obj.username === "string" ? obj.username : null,
        url: typeof obj.url === "string" ? obj.url : null,
      });
    }
  }

  // Second pass: hydrate handle + displayName for user entries.
  if (userIds.length > 0) {
    const rows = await db
      .select({ id: users.id, handle: users.handle, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, userIds));
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const slot of userSlots) {
      const entry = out[slot];
      if (entry.kind !== "user") continue;
      const row = map.get(entry.userId);
      if (row !== undefined) {
        entry.handle = row.handle;
        entry.displayName = row.displayName;
      }
    }
  }

  return out;
}
