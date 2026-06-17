import { randomUUID } from "node:crypto";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { db } from "$lib/server/db";
import { inboxMessages, mcpTokens, orgMembers, orgs, projects, users } from "$lib/server/db/schema";
import { requireEnv } from "$lib/server/env";

// Account self-service: display name and deletion.
//
// Deletion semantics (the privacy-first / content-is-public compromise):
//   - The user row is tombstoned, not deleted: authored content references it
//     with `restrict` FKs and threads must stay coherent. PII columns are
//     scrubbed (display name, email, WorkOS id), deletedAt is set, and the row
//     renders "deleted account" everywhere.
//   - The handle is RETIRED, not freed. It is also the personal org's slug,
//     which the frozen docos' URLs depend on, so freeing it would break those
//     URLs and let someone reclaim the handle and collide with the slug. Kept
//     in the row for resolution, never displayed.
//   - Public contributions (docos, discussions, replies, stamps) stay, under
//     the ghost identity. The personal org is soft-deleted ("deleted org") and
//     its projects freeze: they stop syncing but their docos stay published,
//     de-attributed. The UI points at the per-post deletion-request flow for
//     content someone wants gone before they leave.
//   - Private data IS deleted: inbox, personal MCP tokens, org memberships,
//     and the WorkOS user.
//   - One blocker remains: admin of a non-personal org must be transferred or
//     soft-deleted first. Personal projects no longer block; they freeze.

export interface AccountView {
  handle: string;
  displayName: string | null;
  email: string | null;
  /** Non-personal orgs this user admins; deletion is blocked until they are
   *  transferred or deleted. */
  blockingOrgSlugs: string[];
  /** Projects still in the personal org; deletion is blocked until removed. */
  personalProjectCount: number;
}

export async function getAccountView(userId: string): Promise<AccountView | null> {
  const userRows = await db
    .select({
      handle: users.handle,
      displayName: users.displayName,
      email: users.email,
      personalOrgId: users.personalOrgId,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (userRows.length === 0) return null;
  const user = userRows[0];

  const adminOrgRows = await db
    .select({ id: orgs.id, slug: orgs.slug })
    .from(orgs)
    .where(
      and(
        // A shared org the user already soft-deleted no longer blocks.
        isNull(orgs.deletedAt),
        user.personalOrgId === null
          ? eq(orgs.adminUserId, userId)
          : and(eq(orgs.adminUserId, userId), ne(orgs.id, user.personalOrgId)),
      ),
    );
  const personalProjects =
    user.personalOrgId === null
      ? 0
      : ((
          await db
            .select({ n: count() })
            .from(projects)
            .where(and(eq(projects.ownerOrgId, user.personalOrgId), isNull(projects.deletedAt)))
        )[0]?.n ?? 0);

  return {
    handle: user.handle,
    displayName: user.displayName,
    email: user.email,
    blockingOrgSlugs: adminOrgRows.map((o) => o.slug),
    personalProjectCount: personalProjects,
  };
}

export async function updateDisplayName(userId: string, displayName: string | null): Promise<void> {
  await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, userId));
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "blocked" | "workos_failed" | "not_found" };

/** Tombstones the account. WorkOS deletion runs first and aborts on failure
 *  (retryable, nothing changed locally); the local scrub is one transaction. */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const view = await getAccountView(userId);
  if (view === null) return { ok: false, reason: "not_found" };
  // Only admin'd non-personal orgs block (they need a deliberate transfer or
  // their own soft-delete first). Personal projects don't block; they freeze
  // when the personal org is soft-deleted in the transaction below.
  if (view.blockingOrgSlugs.length > 0) {
    return { ok: false, reason: "blocked" };
  }

  const userRows = await db
    .select({ workosUserId: users.workosUserId, personalOrgId: users.personalOrgId })
    .from(users)
    .where(eq(users.id, userId));
  if (userRows.length === 0) return { ok: false, reason: "not_found" };
  const { workosUserId, personalOrgId } = userRows[0];

  // WorkOS first: if this fails nothing changed locally and the user can
  // retry. The reverse order would leave scrubbed local rows pointing at a
  // live WorkOS identity whose deletion could never be retried (the link is
  // gone), keeping PII at WorkOS forever.
  // try-catch: external API call; network failure or timeout must become a
  // retryable error, not a crash.
  try {
    const res = await fetch(`https://api.workos.com/user_management/users/${workosUserId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${requireEnv("WORKOS_API_KEY")}` },
      // A hung upstream must not pin the request handler open.
      signal: AbortSignal.timeout(10_000),
    });
    // 404 means the WorkOS side is already gone; that's fine for our goal.
    if (!res.ok && res.status !== 404) {
      console.error(`WorkOS user deletion failed (status ${res.status.toString()})`);
      return { ok: false, reason: "workos_failed" };
    }
  } catch (err) {
    console.error("WorkOS user deletion request threw", err);
    return { ok: false, reason: "workos_failed" };
  }

  const tombstoneTag = randomUUID();
  const outcome = await db.transaction(async (tx): Promise<"done" | "raced"> => {
    // Re-check the only blocker inside the transaction: a non-personal org this
    // user became admin of between the pre-check and here must abort the scrub.
    // The WorkOS side is already gone at this point (rare, loud, and
    // recoverable: the data survives); the reverse ordering would lose PII
    // deletion instead, see above. Personal projects no longer block, they
    // freeze under the soft-deleted personal org below.
    const adminOrgRows = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(
        and(
          isNull(orgs.deletedAt),
          personalOrgId === null
            ? eq(orgs.adminUserId, userId)
            : and(eq(orgs.adminUserId, userId), ne(orgs.id, personalOrgId)),
        ),
      );
    if (adminOrgRows.length > 0) return "raced";
    const scrubAt = new Date();
    // Private data goes for real.
    await tx.delete(inboxMessages).where(eq(inboxMessages.userId, userId));
    await tx.delete(mcpTokens).where(eq(mcpTokens.userId, userId));
    await tx.delete(orgMembers).where(eq(orgMembers.userId, userId));
    // Soft-delete the personal org rather than deleting it: its projects freeze
    // (stop syncing) and their docos stay published, de-attributed, instead of
    // cascading away. personalOrgId stays pointing at the tombstoned org.
    if (personalOrgId !== null) {
      await tx
        .update(orgs)
        .set({ deletedAt: scrubAt, updatedAt: scrubAt })
        .where(eq(orgs.id, personalOrgId));
    }
    // Tombstone the user. The handle is RETIRED (kept), not freed: it doubles
    // as the personal org's slug, which the frozen docos' URLs depend on, and
    // freeing it would let someone reclaim it and collide with that slug. The
    // row renders "deleted account" everywhere (resolveAuthors and friends).
    // workosUserId is tagged so the freed WorkOS link can't collide with a
    // future signup; email is nulled so re-registration with it works.
    await tx
      .update(users)
      .set({
        displayName: null,
        email: null,
        workosUserId: `deleted_${tombstoneTag}`,
        isPlatformAdmin: false,
        deletedAt: scrubAt,
        updatedAt: scrubAt,
      })
      .where(eq(users.id, userId));
    return "done";
  });
  if (outcome === "raced") {
    console.error(
      `Account deletion aborted mid-flight for user ${userId}: blockers appeared after the WorkOS user was already deleted. Local data preserved; needs manual follow-up.`,
    );
    return { ok: false, reason: "blocked" };
  }
  return { ok: true };
}
