import { and, count, eq, isNull } from "drizzle-orm";
import type { LayoutServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { inboxMessages } from "$lib/server/db/schema";

// Expose just the safe slices of locals to the client so components like the
// navbar can switch between anonymous / authed-not-onboarded / onboarded
// states. Email and handle are user-facing, the rest stays server-side.
// Also surfaces the inbox unread count so the bell can show a dot anywhere
// the user is signed in.
export const load: LayoutServerLoad = async ({ locals }) => {
  let inboxUnreadCount = 0;
  if (locals.dbUser) {
    // Bell + sidebar dot reflect unread messages still in the Inbox bucket.
    // Done messages are excluded even if their readAt is somehow null, so
    // dismissing a message via mark-done always clears the bell.
    const rows = await db
      .select({ c: count() })
      .from(inboxMessages)
      .where(
        and(
          eq(inboxMessages.userId, locals.dbUser.id),
          isNull(inboxMessages.readAt),
          isNull(inboxMessages.doneAt),
        ),
      );
    inboxUnreadCount = rows[0]?.c ?? 0;
  }

  return {
    auth: locals.auth.user
      ? {
          email: locals.auth.user.email,
        }
      : null,
    dbUser: locals.dbUser
      ? {
          handle: locals.dbUser.handle,
          displayName: locals.dbUser.displayName,
          isPlatformAdmin: locals.dbUser.isPlatformAdmin,
        }
      : null,
    inboxUnreadCount,
  };
};
