import { fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { orgs, orgMembers, projects } from "$lib/server/db/schema";
import { syncProject } from "$lib/sync/run";

// Shell for /dashboard/[org]/[project]. Project + sync state + docos load
// client-side from /api/dashboard/orgs/[org]/projects/[project] so the page
// HTML is shareable across all readers (one cache entry per project URL).
// The resync form action stays here because SvelteKit form actions require
// a server-rendered context to wire up.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=300, s-maxage=2592000, stale-while-revalidate=604800",
  });
  return {};
};

export const actions = {
  resync: async ({ locals, params, platform }) => {
    const userId = locals.dbUser?.id;
    if (!userId) return fail(401, { error: "not_authenticated" });

    // Re-verify org membership in the action (defense in depth; the layout's
    // client-side auth gate doesn't enforce org-specific permissions).
    const orgRows = await db
      .select({ id: orgs.id })
      .from(orgs)
      .innerJoin(orgMembers, and(eq(orgMembers.orgId, orgs.id), eq(orgMembers.userId, userId)))
      .where(eq(orgs.slug, params.org))
      .limit(1);
    if (orgRows.length === 0) return fail(403, { error: "not_a_member" });

    const projectRows = await db
      .select({ id: projects.id, sourceMode: projects.sourceMode })
      .from(projects)
      .where(and(eq(projects.ownerOrgId, orgRows[0].id), eq(projects.slug, params.project)))
      .limit(1);
    if (projectRows.length === 0) return fail(404, { error: "not_found" });
    if (projectRows[0].sourceMode !== "git") {
      return fail(400, { error: "not_git_project" });
    }

    if (platform) {
      platform.context.waitUntil(syncProject(projectRows[0].id, platform.env.MEDIA_BUCKET));
    }

    return { ok: true };
  },
} satisfies Actions;
