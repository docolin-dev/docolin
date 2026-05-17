import { error, fail } from "@sveltejs/kit";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { inboxMessages } from "$lib/server/db/schema";

// Done bucket: messages the user explicitly marked done. Read state on
// these doesn't matter for the view (everything in done is also read in
// practice, since you have to open a message to mark it done).
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
  const userId = locals.dbUser?.id;
  if (!userId) error(404);

  setHeaders({ "cache-control": "private, no-store" });

  const rows = await db
    .select({
      id: inboxMessages.id,
      kind: inboxMessages.kind,
      subject: inboxMessages.subject,
      preview: inboxMessages.preview,
      linkUrl: inboxMessages.linkUrl,
      readAt: inboxMessages.readAt,
      doneAt: inboxMessages.doneAt,
      createdAt: inboxMessages.createdAt,
    })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.userId, userId), isNotNull(inboxMessages.doneAt)))
    .orderBy(desc(inboxMessages.doneAt))
    .limit(100);

  return {
    bucket: "done" as const,
    messages: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      subject: r.subject,
      preview: r.preview,
      hasLink: r.linkUrl !== null,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
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
