import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { orgs, orgMembers, projects } from "$lib/server/db/schema";
import { checkProjectSlugAvailability } from "$lib/reserved-handles";

// Live availability check for a new project slug within a specific org.
// Validates shape via checkProjectSlugAvailability (looser rules than user
// handles: 2-char minimum, smaller reserved set just for project-level
// admin routes), then checks (ownerOrgId, slug) uniqueness.
//
// Caller passes ?org={orgSlug}&h={projectSlug}. Auth is required (user must
// be a member of the org); we 404 otherwise so non-members can't probe org
// existence.
export const GET: RequestHandler = async ({ url, locals }) => {
  const userId = locals.dbUser?.id;
  if (!userId) error(404);

  const orgSlug = url.searchParams.get("org") ?? "";
  const raw = url.searchParams.get("h") ?? "";
  const slug = raw.trim().toLowerCase();

  const shapeCheck = checkProjectSlugAvailability(slug);
  if (!shapeCheck.ok) {
    return json({ ok: false, reason: shapeCheck.reason });
  }

  // Look up the org by slug + verify membership in one go. If the user isn't
  // a member, return 404 so they can't probe.
  const orgRows = await db
    .select({ id: orgs.id })
    .from(orgs)
    .innerJoin(orgMembers, and(eq(orgMembers.orgId, orgs.id), eq(orgMembers.userId, userId)))
    .where(eq(orgs.slug, orgSlug))
    .limit(1);
  if (orgRows.length === 0) error(404);
  const orgId = orgRows[0].id;

  const taken = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.ownerOrgId, orgId), eq(projects.slug, slug)))
    .limit(1);

  if (taken.length > 0) {
    return json({ ok: false, reason: "taken" });
  }

  return json({ ok: true });
};
