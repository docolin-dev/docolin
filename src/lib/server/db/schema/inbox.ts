import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// In-app inbox. Per-user feed of system messages (report resolutions, deletion
// outcomes, mentions, replies to threads the user is subscribed to). Markdown body.
// No external delivery channel (email, push).
export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Single-line title shown in the list row. Distinct from bodyMarkdown so
    // the list/preview/detail split works like an email client.
    subject: text("subject").notNull().default(""),
    // Short one-line summary shown in the list row beneath the subject.
    // Authored explicitly (not derived from bodyMarkdown) so directive
    // syntax and long-form content never bleed into the list view.
    preview: text("preview").notNull().default(""),
    kind: text("kind")
      .notNull()
      .$type<
        | "report_filed_against_you"
        | "report_resolved"
        | "content_hidden"
        | "content_redacted"
        | "content_unhidden"
        | "embargo_expired"
        | "deletion_approved"
        | "deletion_denied"
        | "mod_decision_reversed"
        | "mention"
        | "discussion_reply"
        | "claim_approved"
        | "claim_cancelled"
        | "org_member_added"
        | "discussion_status_changed"
      >(),
    bodyMarkdown: text("body_markdown").notNull(),
    linkUrl: text("link_url"),
    relatedRecordId: uuid("related_record_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    // Set when the user marks the message done. Done messages move to a
    // separate bucket so the inbox feels like an actionable queue rather
    // than an accumulating log. State is derived: read_at + done_at jointly
    // determine which bucket a row lives in.
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("inbox_messages_user_idx").on(t.userId, t.createdAt.desc()),
    index("inbox_messages_user_unread_idx")
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.readAt} IS NULL`),
    check(
      "inbox_messages_kind_check",
      sql`${t.kind} IN ('report_filed_against_you', 'report_resolved', 'content_hidden', 'content_redacted', 'content_unhidden', 'embargo_expired', 'deletion_approved', 'deletion_denied', 'mod_decision_reversed', 'mention', 'discussion_reply', 'claim_approved', 'claim_cancelled', 'org_member_added', 'discussion_status_changed')`,
    ),
  ],
);
