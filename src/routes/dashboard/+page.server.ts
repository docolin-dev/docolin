import { and, eq, sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { claimRequests, orgs, orgMembers, projects } from "$lib/server/db/schema";

// Loads the list of orgs the current user is a member of, with each org's
// project count for the card display. Personal org is identified by the
// user's personal_org_id, not by sort order.
export const load: PageServerLoad = async ({ locals }) => {
  // Layout guards locals.dbUser exists; the non-null assertion is safe.
  const userId = locals.dbUser?.id;
  if (!userId) return { orgs: [], pendingClaims: [] };

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
    .leftJoin(projects, eq(projects.ownerOrgId, orgs.id))
    .where(eq(orgMembers.userId, userId))
    .groupBy(orgs.id)
    .orderBy(orgs.createdAt);

  // Pending claims this user filed. Approved claims have already become orgs
  // (shown in the grid above), cancelled/expired aren't actionable, so the
  // dashboard surfaces only "pending", since they need the user to send the
  // verification email before anything moves.
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

  return {
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
  };
};
