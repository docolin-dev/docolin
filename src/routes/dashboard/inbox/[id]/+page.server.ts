import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { inboxMessages } from "$lib/server/db/schema";
import { renderMarkdown } from "$lib/server/markdown";

// Detail view of a single inbox message. Auto-marks read on load (opening
// the page counts as reading). Mark-done / move-back-to-inbox are explicit
// form actions; opening the linked thing is a separate CTA that doesn't
// imply "done."
export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
  const userId = locals.dbUser?.id;
  if (!userId) error(404);

  setHeaders({ "cache-control": "private, no-store" });

  const rows = await db
    .select({
      id: inboxMessages.id,
      kind: inboxMessages.kind,
      subject: inboxMessages.subject,
      bodyMarkdown: inboxMessages.bodyMarkdown,
      linkUrl: inboxMessages.linkUrl,
      readAt: inboxMessages.readAt,
      doneAt: inboxMessages.doneAt,
      createdAt: inboxMessages.createdAt,
    })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.id, params.id), eq(inboxMessages.userId, userId)))
    .limit(1);
  if (rows.length === 0) error(404);
  const row = rows[0];

  // Auto-mark-read on load. Idempotent: only updates rows still unread, so
  // the first view sets the timestamp and subsequent views are no-ops.
  if (row.readAt === null) {
    await db
      .update(inboxMessages)
      .set({ readAt: new Date() })
      .where(and(eq(inboxMessages.id, row.id), isNull(inboxMessages.readAt)));
  }

  return {
    message: {
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      bodyHtml: renderMarkdown(row.bodyMarkdown),
      linkUrl: row.linkUrl,
      doneAt: row.doneAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    },
  };
};

export const actions = {
  markDone: async ({ locals, params }) => {
    if (!locals.dbUser) return fail(401, { error: "not_authenticated" });
    await db
      .update(inboxMessages)
      .set({ doneAt: new Date() })
      .where(and(eq(inboxMessages.id, params.id), eq(inboxMessages.userId, locals.dbUser.id)));
    redirect(303, "/dashboard/inbox");
  },

  markUndone: async ({ locals, params }) => {
    if (!locals.dbUser) return fail(401, { error: "not_authenticated" });
    await db
      .update(inboxMessages)
      .set({ doneAt: null })
      .where(and(eq(inboxMessages.id, params.id), eq(inboxMessages.userId, locals.dbUser.id)));
    redirect(303, "/dashboard/inbox/done");
  },
} satisfies Actions;
