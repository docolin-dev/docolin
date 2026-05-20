import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { docos, orgs, projects } from "$lib/server/db/schema";

// Per-user moderation capability for one doco, driving the doco viewer's
// actions menu (the "request deletion" item is moderator-only). Split out from
// the cached public viewer so the page HTML stays identical for every reader;
// the client fetches this only when signed in. Reporting is available to any
// signed-in user, so it doesn't need this.
export interface DocoCapabilities {
  canModerate: boolean;
}

export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
  setHeaders({ "cache-control": "private, no-store" });

  if (!locals.dbUser) return json({ canModerate: false } satisfies DocoCapabilities);

  const rows = await db
    .select({ adminUserId: orgs.adminUserId })
    .from(docos)
    .innerJoin(projects, eq(projects.id, docos.projectId))
    .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
    .where(eq(docos.id, params.docoId))
    .limit(1);
  if (rows.length === 0) return json({ canModerate: false } satisfies DocoCapabilities);

  // Platform admin or the owning org's admin (same gate as discussions; org-role
  // permissions come later).
  const canModerate = locals.dbUser.isPlatformAdmin || locals.dbUser.id === rows[0].adminUserId;
  return json({ canModerate } satisfies DocoCapabilities);
};
