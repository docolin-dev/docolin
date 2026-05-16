import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { users, orgs, orgMembers } from "$lib/server/db/schema";
import type { DbOrg, DbUser } from "./users";

export interface ProvisionInput {
  workosUserId: string;
  handle: string;
  displayName: string | null;
  email: string | null;
}

export interface ProvisionResult {
  user: DbUser;
  personalOrg: DbOrg;
}

// Single transaction that turns a freshly authed WorkOS identity into a real
// docolin account: user row, personal org row, link user->org, membership.
// All-or-nothing — if any step fails (unique-constraint conflict, etc.), the
// transaction rolls back and the caller can surface a friendly error.
export async function provisionUser(input: ProvisionInput): Promise<ProvisionResult> {
  return db.transaction(async (tx) => {
    const [insertedUser] = await tx
      .insert(users)
      .values({
        workosUserId: input.workosUserId,
        handle: input.handle,
        displayName: input.displayName,
        email: input.email,
      })
      .returning();

    const [insertedOrg] = await tx
      .insert(orgs)
      .values({
        slug: input.handle,
        displayName: input.displayName,
        adminUserId: insertedUser.id,
        foundedByUserId: insertedUser.id,
      })
      .returning();

    const [linkedUser] = await tx
      .update(users)
      .set({ personalOrgId: insertedOrg.id })
      .where(eq(users.id, insertedUser.id))
      .returning();

    await tx.insert(orgMembers).values({
      orgId: insertedOrg.id,
      userId: insertedUser.id,
    });

    return { user: linkedUser, personalOrg: insertedOrg };
  });
}
