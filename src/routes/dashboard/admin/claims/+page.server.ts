import { desc, eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { claimRequests, users } from "$lib/server/db/schema";

export const load: PageServerLoad = async () => {
  const rows = await db
    .select({
      uid: claimRequests.uid,
      slug: claimRequests.requestedSlug,
      details: claimRequests.details,
      createdAt: claimRequests.createdAt,
      requesterHandle: users.handle,
      requesterDisplayName: users.displayName,
      requesterEmail: users.email,
      requesterDeletedAt: users.deletedAt,
    })
    .from(claimRequests)
    .innerJoin(users, eq(users.id, claimRequests.requestedByUserId))
    .where(eq(claimRequests.status, "pending"))
    .orderBy(desc(claimRequests.createdAt));

  return {
    claims: rows.map((r) => {
      // A tombstoned requester's identity is blanked here so the queue can't
      // leak the retired handle/displayName/email; the page shows "deleted
      // account" off the flag instead.
      const deleted = r.requesterDeletedAt !== null;
      return {
        uid: r.uid,
        slug: r.slug,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
        requester: {
          deleted,
          handle: deleted ? "" : r.requesterHandle,
          displayName: deleted ? null : r.requesterDisplayName,
          email: deleted ? null : r.requesterEmail,
        },
      };
    }),
  };
};
