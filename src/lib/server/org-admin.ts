import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
  docos,
  gitSources,
  inboxMessages,
  orgMembers,
  orgs,
  projects,
  users,
} from "$lib/server/db/schema";
import type { ForgeProvider } from "$lib/git/forge";

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
    // A soft-deleted org is gone from the dashboard; managing it makes no sense.
    .where(and(eq(orgs.slug, slug), isNull(orgs.deletedAt)));
  if (rows.length === 0) return null;
  const org = rows[0];

  const [projectRows, personalRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(projects)
      .where(and(eq(projects.ownerOrgId, org.id), isNull(projects.deletedAt))),
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
    // Defensive: a deleted user's memberships are already dropped on account
    // deletion, but never surface a tombstoned account in a member list.
    .where(and(eq(orgMembers.orgId, orgId), isNull(users.deletedAt)))
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

export type DeleteOrgResult = { ok: true } | { ok: false; reason: "is_personal" };

/** Soft-deletes a non-personal org. The org row, its projects, docos, versions,
 *  discussions, and stamps all stay: the org is tombstoned (rendered "deleted
 *  org") and its projects freeze, they stop syncing but their docos stay
 *  published, de-attributed to the deleted org. Nothing cascades, that is the
 *  whole point of soft-deleting rather than `delete`. Personal orgs aren't
 *  deletable here; they die with the account (see deleteAccount). */
export async function deleteOrg(org: OrgAdminView): Promise<DeleteOrgResult> {
  return await db.transaction(async (tx) => {
    const personalRows = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.personalOrgId, org.id));
    if (personalRows.length > 0) return { ok: false, reason: "is_personal" as const };
    const now = new Date();
    await tx.update(orgs).set({ deletedAt: now, updatedAt: now }).where(eq(orgs.id, org.id));
    return { ok: true as const };
  });
}

export async function renameProject(projectId: string, displayName: string | null): Promise<void> {
  await db
    .update(projects)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/** Soft-deletes a project. The project row, its git source, docos, versions,
 *  discussions, and stamps all stay: deleting a project must not destroy the
 *  guides published from it. The project is tombstoned and every still-live
 *  doco is tombstoned with it (one shared timestamp), so they drop out of search
 *  and browse, while their URLs keep serving the removed banner. Recreating the
 *  same org+slug revives the project (see the project-create flow), and a forced
 *  re-sync un-deletes the docos still in the repo and sweeps the ones that
 *  aren't. The caller purges the edge cache, since the public pages would
 *  otherwise keep serving from SWR for up to a week. */
export async function deleteProject(projectId: string): Promise<void> {
  // Single timestamp for the project and its docos: cosmetic, but it marks the
  // tombstones as one event rather than a scatter of near-equal times.
  const deletedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(projects.id, projectId));
    await tx
      .update(docos)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(docos.projectId, projectId), isNull(docos.deletedAt)));
  });
}

/** Revives a soft-deleted git project: clears the project tombstone and points
 *  its git source at the (re-verified) repo. The doco tombstones are left in
 *  place for the caller's forced re-sync to resolve, files still in the repo
 *  are un-deleted, files no longer there stay deleted. `lastSyncedCommit` is
 *  deliberately left intact; force=true on the re-sync re-processes the whole
 *  tree regardless of it, so a recreate with no new commits still un-tombstones
 *  what is present. */
export async function reviveGitProject(
  projectId: string,
  displayName: string | null,
  repo: { provider: ForgeProvider; repoUrl: string; defaultBranch: string; subpath: string | null },
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ deletedAt: null, displayName, sourceMode: "git", updatedAt: now })
      .where(eq(projects.id, projectId));
    // The git source survived the soft-delete, so refresh it in place. If the
    // revived project had been native (no source), insert one.
    const existing = await tx
      .select({ projectId: gitSources.projectId })
      .from(gitSources)
      .where(eq(gitSources.projectId, projectId))
      .limit(1);
    if (existing.length > 0) {
      await tx
        .update(gitSources)
        .set({
          provider: repo.provider,
          repoUrl: repo.repoUrl,
          defaultBranch: repo.defaultBranch,
          subpath: repo.subpath,
          updatedAt: now,
        })
        .where(eq(gitSources.projectId, projectId));
    } else {
      await tx.insert(gitSources).values({
        projectId,
        provider: repo.provider,
        repoUrl: repo.repoUrl,
        defaultBranch: repo.defaultBranch,
        subpath: repo.subpath,
      });
    }
  });
}
