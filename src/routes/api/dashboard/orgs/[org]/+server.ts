import { error, json } from "@sveltejs/kit";
import { and, count, eq, isNull } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { orgs, orgMembers, projects } from "$lib/server/db/schema";

// Per-user data for /dashboard/[org]. Membership-gated: returns 404 (not 403)
// for non-members so the page can't be used to probe org existence. Page
// shell is edge-cacheable per URL; this endpoint stays `private, no-store`.
export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
  const userId = locals.dbUser?.id;
  if (!userId) error(401, "not_authenticated");

  setHeaders({ "cache-control": "private, no-store" });

  const orgRows = await db
    .select()
    .from(orgs)
    .where(and(eq(orgs.slug, params.org), isNull(orgs.deletedAt)))
    .limit(1);
  if (orgRows.length === 0) error(404);
  const org = orgRows[0];

  const memberRows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, userId)))
    .limit(1);
  if (memberRows.length === 0) error(404);

  const memberCountRows = await db
    .select({ c: count() })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, org.id));
  const memberCount = memberCountRows[0]?.c ?? 0;

  const orgProjects = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      displayName: projects.displayName,
      sourceMode: projects.sourceMode,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.ownerOrgId, org.id), isNull(projects.deletedAt)))
    .orderBy(projects.createdAt);

  return json({
    org: {
      id: org.id,
      slug: org.slug,
      displayName: org.displayName,
      isPersonal: org.id === locals.personalOrg?.id,
      memberCount,
    },
    projects: orgProjects.map((p) => ({
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      sourceMode: p.sourceMode,
      createdAt: p.createdAt.toISOString(),
    })),
  });
};
