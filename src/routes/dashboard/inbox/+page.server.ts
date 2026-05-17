import { error, fail } from "@sveltejs/kit";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { inboxMessages } from "$lib/server/db/schema";

// Inbox bucket: messages not yet marked done. Both unread and read live
// here. Done messages live at /dashboard/inbox/done.
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
      createdAt: inboxMessages.createdAt,
    })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.userId, userId), isNull(inboxMessages.doneAt)))
    .orderBy(desc(inboxMessages.createdAt))
    .limit(100);

  return {
    bucket: "inbox" as const,
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

// Inline mark-done from a list row. Posted from the per-row form rendered
// in InboxList; the row drops out of the list on success (filtered to
// doneAt IS NULL). Auto-marks read too: if the user is dismissing it
// without opening, they've decided they don't need to read it.
export const actions = {
  markDone: async ({ locals, request }) => {
    if (!locals.dbUser) return fail(401, { error: "not_authenticated" });
    const form = await request.formData();
    const id = form.get("id");
    if (typeof id !== "string") return fail(400, { error: "missing_id" });

    const now = new Date();
    // COALESCE preserves the original read timestamp if the user already
    // opened the message before dismissing. Only fills readAt when it was
    // null (dismissed without ever opening).
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
