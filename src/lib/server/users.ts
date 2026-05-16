import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { users, orgs, type users as usersTable } from "$lib/server/db/schema";

export type DbUser = typeof usersTable.$inferSelect;
export type DbOrg = typeof orgs.$inferSelect;

export interface UserWithPersonalOrg {
  user: DbUser;
  personalOrg: DbOrg | null;
}

// Look up our row for a given WorkOS user id, joining the personal org if
// one exists. Returns null when the WorkOS user hasn't finished onboarding.
export async function findUserByWorkosId(
  workosUserId: string,
): Promise<UserWithPersonalOrg | null> {
  const rows = await db
    .select({ user: users, personalOrg: orgs })
    .from(users)
    .leftJoin(orgs, eq(orgs.id, users.personalOrgId))
    .where(eq(users.workosUserId, workosUserId))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return { user: row.user, personalOrg: row.personalOrg };
}
