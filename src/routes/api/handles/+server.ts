import { json } from "@sveltejs/kit";
import { inArray } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";

// Resolves docolin handles to their public display names. The local-folder
// preview runs entirely client-side (no server load), so it calls this to
// render author bylines exactly like a published page would. Public data only
// (a handle's display name is shown on its public profile), so it's edge-cached
// like any other read.
export interface HandleInfo {
  handle: string;
  displayName: string | null;
  // Whether the handle is a real docolin user. The preview surfaces unknown
  // handles as the same validation a sync would reject the doco with.
  exists: boolean;
}

const CACHE = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

// Cap the batch so one request can't ask for an unbounded IN list.
const MAX_HANDLES = 50;

export const GET: RequestHandler = async ({ url, setHeaders }) => {
  const handles = [
    ...new Set(
      (url.searchParams.get("h") ?? "")
        .split(",")
        .map((h) => h.trim())
        .filter((h) => h.length > 0),
    ),
  ].slice(0, MAX_HANDLES);

  setHeaders({ "cache-control": CACHE });
  if (handles.length === 0) return json([] satisfies HandleInfo[]);

  const rows = await db
    .select({ handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(inArray(users.handle, handles));
  const found = new Map(rows.map((r) => [r.handle, r.displayName]));

  return json(
    handles.map((handle) => ({
      handle,
      displayName: found.get(handle) ?? null,
      exists: found.has(handle),
    })) satisfies HandleInfo[],
  );
};
