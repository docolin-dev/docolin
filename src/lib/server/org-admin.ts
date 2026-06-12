import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "$lib/server/db";
import { inboxMessages, orgMembers, orgs, projects, users } from "$lib/server/db/schema";

// Org administration: members, rename, delete. Authority model matches the
// rest of the platform (see canModerateDiscussion): the org admin and platform
// admins, no role granularity yet. The dormant org_roles tables take over once
// the permission vocabulary is defined; building a parallel admin/member
// picker now would only conflict with that.

export interface OrgAdminView {
  id: string;
  slug: string;
  displayName: string | null;
  adminUserId: string;
  projectCount: number;
  /** Whether this org is somebody's personal org (undeletable; it dies with
   *  the account, not before). */
  isPersonal: boolean;
}

export interface OrgMemberRow {
  userId: string;
  handle: string;
  displayName: string | null;
  joinedAt: string;
  isAdmin: boolean;
}

export async function getOrgAdminView(slug: string): Promise<OrgAdminView | null> {
  const rows = await db
    .select({
      id: orgs.id,
      slug: orgs.slug,
      displayName: orgs.displayName,
      adminUserId: orgs.adminUserId,
    })
    .from(orgs)
    .where(eq(orgs.slug, slug));
  if (rows.length === 0) return null;
  const org = rows[0];

  const [projectRows, personalRows] = await Promise.all([
    db.select({ n: count() }).from(projects).where(eq(projects.ownerOrgId, org.id)),
    db.select({ id: users.id }).from(users).where(eq(users.personalOrgId, org.id)),
  ]);
  return {
    ...org,
    projectCount: projectRows[0]?.n ?? 0,
    isPersonal: personalRows.length > 0,
  };
}

export async function isOrgMember(orgId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  return rows.length > 0;
}

export async function listOrgMembers(orgId: string, adminUserId: string): Promise<OrgMemberRow[]> {
  const rows = await db
    .select({
      userId: orgMembers.userId,
      handle: users.handle,
      displayName: users.displayName,
      joinedAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(orgMembers.createdAt);
  return rows.map((r) => ({
    userId: r.userId,
    handle: r.handle,
    displayName: r.displayName,
    joinedAt: r.joinedAt.toISOString(),
    isAdmin: r.userId === adminUserId,
  }));
}

export type AddMemberResult =
  | { ok: true }
  | { ok: false; reason: "handle_not_found" | "already_member" };

/** Adds a user to the org by handle and drops them an inbox note. Direct add
 *  (no invitation acceptance): there is no email infra, the inbox message is
 *  the consent surface, and leaving is one click. */
export async function addOrgMember(
  org: { id: string; slug: string; displayName: string | null },
  handle: string,
): Promise<AddMemberResult> {
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.handle, handle.toLowerCase()), isNull(users.deletedAt)));
  if (userRows.length === 0) return { ok: false, reason: "handle_not_found" };
  const userId = userRows[0].id;

  const inserted = await db
    .insert(orgMembers)
    .values({ orgId: org.id, userId })
    .onConflictDoNothing()
    .returning({ userId: orgMembers.userId });
  if (inserted.length === 0) return { ok: false, reason: "already_member" };

  const orgLabel = org.displayName ?? org.slug;
  const dashboardUrl = `/dashboard/${org.slug}`;
  await db.insert(inboxMessages).values({
    userId,
    kind: "org_member_added",
    subject: `You were added to ${orgLabel}`,
    preview: `You are now a member of the ${orgLabel} organization.`,
    bodyMarkdown: `You were added to the **${orgLabel}** organization. You can leave at any time from the org settings.

[Open the org dashboard](${dashboardUrl}){ .md-button .md-button--primary }`,
    linkUrl: dashboardUrl,
    relatedRecordId: org.id,
  });
  return { ok: true };
}

export type RemoveMemberResult = { ok: true } | { ok: false; reason: "is_admin" | "not_member" };

/** Removes a member (admin removing someone, or a member leaving: same
 *  mutation, the action layer decides who may call it for whom). The org
 *  admin can never be removed; admin transfer is a separate future concern. */
export async function removeOrgMember(
  org: { id: string; adminUserId: string },
  userId: string,
): Promise<RemoveMemberResult> {
  if (userId === org.adminUserId) return { ok: false, reason: "is_admin" };
  const deleted = await db
    .delete(orgMembers)
    .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.userId, userId)))
    .returning({ userId: orgMembers.userId });
  if (deleted.length === 0) return { ok: false, reason: "not_member" };
  return { ok: true };
}

export async function renameOrg(orgId: string, displayName: string | null): Promise<void> {
  await db.update(orgs).set({ displayName, updatedAt: new Date() }).where(eq(orgs.id, orgId));
}

export type DeleteOrgResult = { ok: true } | { ok: false; reason: "has_projects" | "is_personal" };

/** Deletes an empty, non-personal org. Projects must be deleted first (their
 *  own deliberate, type-to-confirm act); personal orgs die with the account. */
export async function deleteOrg(org: OrgAdminView): Promise<DeleteOrgResult> {
  if (org.projectCount > 0) return { ok: false, reason: "has_projects" };
  if (org.isPersonal) return { ok: false, reason: "is_personal" };
  await db.delete(orgs).where(eq(orgs.id, org.id));
  return { ok: true };
}

export async function renameProject(projectId: string, displayName: string | null): Promise<void> {
  await db
    .update(projects)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/** Hard-deletes a project; docos, versions, discussions, and stamps cascade.
 *  The caller confirms loudly (community contributions go with it) and purges
 *  the edge cache, since the project's public pages would otherwise keep
 *  serving from SWR for up to a week. */
export async function deleteProject(projectId: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, projectId));
}
