import { fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { inboxMessages } from "$lib/server/db/schema";
import { localizeHref } from "$paraglide/runtime";

// Shell for the message detail. Body + read-marker side effect both move to
// /api/dashboard/inbox/[id]. Mark-done / move-back-to-inbox actions stay
// here so the inline buttons keep working with use:enhance.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=300, s-maxage=2592000, stale-while-revalidate=604800",
  });
  return {};
};

export const actions = {
  markDone: async ({ locals, params }) => {
    if (!locals.dbUser) return fail(401, { error: "not_authenticated" });
    await db
      .update(inboxMessages)
      .set({ doneAt: new Date() })
      .where(and(eq(inboxMessages.id, params.id), eq(inboxMessages.userId, locals.dbUser.id)));
    redirect(303, localizeHref("/dashboard/inbox"));
  },

  markUndone: async ({ locals, params }) => {
    if (!locals.dbUser) return fail(401, { error: "not_authenticated" });
    await db
      .update(inboxMessages)
      .set({ doneAt: null })
      .where(and(eq(inboxMessages.id, params.id), eq(inboxMessages.userId, locals.dbUser.id)));
    redirect(303, localizeHref("/dashboard/inbox/done"));
  },
} satisfies Actions;
