import { fail } from "@sveltejs/kit";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { inboxMessages } from "$lib/server/db/schema";

// Shell for the inbox list. Messages load client-side from /api/dashboard/
// inbox?bucket=inbox so the page HTML stays the same for every reader.
// The markDone form action stays here because SvelteKit form actions need
// a server-rendered context.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=300, s-maxage=2592000, stale-while-revalidate=604800",
  });
  return {};
};

// Inline mark-done from a list row. COALESCE preserves the original read
// timestamp if the user already opened the message before dismissing; only
// fills readAt when it was null (dismissed without ever opening).
export const actions = {
  markDone: async ({ locals, request }) => {
    if (!locals.dbUser) return fail(401, { error: "not_authenticated" });
    const form = await request.formData();
    const id = form.get("id");
    if (typeof id !== "string") return fail(400, { error: "missing_id" });

    const now = new Date();
    await db
      .update(inboxMessages)
      .set({
        doneAt: now,
        readAt: sql`COALESCE(${inboxMessages.readAt}, ${now})`,
      })
      .where(
        and(
          eq(inboxMessages.id, id),
          eq(inboxMessages.userId, locals.dbUser.id),
          isNull(inboxMessages.doneAt),
        ),
      );

    return { ok: true };
  },
} satisfies Actions;
