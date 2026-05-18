import { fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { inboxMessages } from "$lib/server/db/schema";

// Shell for the done bucket. Messages load client-side from /api/dashboard/
// inbox?bucket=done. markUndone action stays here for the per-row form.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=300, s-maxage=2592000, stale-while-revalidate=604800",
  });
  return {};
};

// Inline "move back to inbox" from a Done row. Clears doneAt; the row drops
// out of the Done list (filtered to doneAt IS NOT NULL).
export const actions = {
  markUndone: async ({ locals, request }) => {
    if (!locals.dbUser) return fail(401, { error: "not_authenticated" });
    const form = await request.formData();
    const id = form.get("id");
    if (typeof id !== "string") return fail(400, { error: "missing_id" });

    await db
      .update(inboxMessages)
      .set({ doneAt: null })
      .where(and(eq(inboxMessages.id, id), eq(inboxMessages.userId, locals.dbUser.id)));

    return { ok: true };
  },
} satisfies Actions;
