import { error, json } from "@sveltejs/kit";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { claimRequests, orgs, orgMembers, projects } from "$lib/server/db/schema";

// Per-user data for the /dashboard home page. Split out from the page server
// load so the page itself is a session-independent shell that the edge can
// cache; this endpoint stays `private, no-store` and runs every request for
// the signed-in user.
//
// Returns the orgs the current user belongs to (with project counts for the
// card display) plus any pending claim requests they filed.

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
  const userId = locals.dbUser?.id;
  // 401 (not 404) so the client-side shell can react: a stale session, fresh
  // signout, or just-onboarded state all map to "refresh session and bounce".
  if (!userId) error(401, "not_authenticated");

  setHeaders({ "cache-control": "private, no-store" });

  const personalOrgId = locals.personalOrg?.id ?? null;

  const rows = await db
    .select({
      id: orgs.id,
      slug: orgs.slug,
      displayName: orgs.displayName,
      projectCount: sql<number>`COUNT(${projects.id})::int`.as("project_count"),
    })
    .from(orgs)
    .innerJoin(orgMembers, eq(orgMembers.orgId, orgs.id))
    // Soft-deleted projects don't count toward the org's project tally.
    .leftJoin(projects, and(eq(projects.ownerOrgId, orgs.id), isNull(projects.deletedAt)))
    // A soft-deleted org drops off the user's dashboard, even if they're still a
    // member row on it (memberships aren't scrubbed on org delete).
    .where(and(eq(orgMembers.userId, userId), isNull(orgs.deletedAt)))
    .groupBy(orgs.id)
    .orderBy(orgs.createdAt);

  const pendingClaims = await db
    .select({
      uid: claimRequests.uid,
      slug: claimRequests.requestedSlug,
      displayName: claimRequests.requestedDisplayName,
      createdAt: claimRequests.createdAt,
    })
    .from(claimRequests)
    .where(and(eq(claimRequests.requestedByUserId, userId), eq(claimRequests.status, "pending")))
    .orderBy(claimRequests.createdAt);

  return json({
    orgs: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      displayName: r.displayName,
      isPersonal: r.id === personalOrgId,
      projectCount: r.projectCount,
    })),
    pendingClaims: pendingClaims.map((c) => ({
      uid: c.uid,
      slug: c.slug,
      displayName: c.displayName,
      createdAt: c.createdAt.toISOString(),
    })),
  });
};
