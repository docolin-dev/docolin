import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { docos, versions } from "./docos";
import { users } from "./users";
import type { ReactionEmoji } from "$lib/reactions";

// Discussions and replies carry hide / redact state directly. `hidden_*` columns
// describe a non-destructive hide (visible to admins + author only). `redacted_*`
// columns describe a destructive privacy redaction (original body replaced; no
// recovery path). `hidden_until` supports embargo-style hides that auto-reverse.
export const discussions = pgTable(
  "discussions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    docoId: uuid("doco_id")
      .notNull()
      .references(() => docos.id, { onDelete: "cascade" }),
    // Per-doco sequential number (the #N in the URL, GitHub-issue style).
    // Assigned from docos.discussion_seq at creation; stable across title edits
    // and other discussions being deleted. Unique within a doco.
    number: integer("number").notNull(),
    versionId: uuid("version_id").references(() => versions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    bodyText: text("body_text").notNull(),
    bodyFormat: text("body_format").notNull().default("commonmark").$type<"commonmark">(),
    status: text("status").notNull().default("open").$type<"open" | "closed" | "resolved">(),
    // Pinned threads sort to the top of a doco's discussion list. Moderator
    // action; null = not pinned.
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    // The reply marked as the accepted answer (Q&A). Set by the thread author
    // or a moderator; cleared if that reply is deleted. Forward ref because
    // discussion_replies is defined below in this same module.
    answeredReplyId: uuid("answered_reply_id").references((): AnyPgColumn => discussionReplies.id, {
      onDelete: "set null",
    }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    hiddenReason: text("hidden_reason"),
    hiddenUntil: timestamp("hidden_until", { withTimezone: true }),
    isRedacted: boolean("is_redacted").notNull().default(false),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    redactedByUserId: uuid("redacted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    redactedReason: text("redacted_reason"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("discussions_doco_idx").on(t.docoId),
    uniqueIndex("discussions_doco_number_unique").on(t.docoId, t.number),
    // Backs the per-doco list query (ordered by recent activity).
    index("discussions_doco_activity_idx").on(t.docoId, t.updatedAt.desc()),
    index("discussions_status_idx").on(t.status),
    index("discussions_created_by_idx").on(t.createdByUserId),
    index("discussions_hidden_idx").on(t.hiddenAt),
    check("discussions_status_check", sql`${t.status} IN ('open', 'closed', 'resolved')`),
  ],
);

// Flat reply list (no nested threading). Add a parent column later if community asks.
export const discussionReplies = pgTable(
  "discussion_replies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discussionId: uuid("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    bodyText: text("body_text").notNull(),
    bodyFormat: text("body_format").notNull().default("commonmark").$type<"commonmark">(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    hiddenReason: text("hidden_reason"),
    hiddenUntil: timestamp("hidden_until", { withTimezone: true }),
    isRedacted: boolean("is_redacted").notNull().default(false),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    redactedByUserId: uuid("redacted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    redactedReason: text("redacted_reason"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("discussion_replies_discussion_idx").on(t.discussionId),
    index("discussion_replies_created_at_idx").on(t.createdAt),
    index("discussion_replies_hidden_idx").on(t.hiddenAt),
  ],
);

// Author edit history. Original body is preserved here every time the author edits;
// the current body lives on the discussion / reply row. Each prior version is a
// moderatable target on its own (same hide / redact semantics as a live post):
// a secret leaked in an old version still renders in the public history panel
// until that one row is hidden or redacted.
export const discussionEdits = pgTable(
  "discussion_edits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discussionId: uuid("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    priorBodyText: text("prior_body_text").notNull(),
    priorBodyFormat: text("prior_body_format").notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id, { onDelete: "set null" }),
    hiddenReason: text("hidden_reason"),
    hiddenUntil: timestamp("hidden_until", { withTimezone: true }),
    isRedacted: boolean("is_redacted").notNull().default(false),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    redactedByUserId: uuid("redacted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    redactedReason: text("redacted_reason"),
    editedByUserId: uuid("edited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    editedAt: timestamp("edited_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("discussion_edits_discussion_idx").on(t.discussionId),
    index("discussion_edits_hidden_idx").on(t.hiddenAt),
  ],
);

export const discussionReplyEdits = pgTable(
  "discussion_reply_edits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discussionReplyId: uuid("discussion_reply_id")
      .notNull()
      .references(() => discussionReplies.id, { onDelete: "cascade" }),
    priorBodyText: text("prior_body_text").notNull(),
    priorBodyFormat: text("prior_body_format").notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id, { onDelete: "set null" }),
    hiddenReason: text("hidden_reason"),
    hiddenUntil: timestamp("hidden_until", { withTimezone: true }),
    isRedacted: boolean("is_redacted").notNull().default(false),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    redactedByUserId: uuid("redacted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    redactedReason: text("redacted_reason"),
    editedByUserId: uuid("edited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    editedAt: timestamp("edited_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("discussion_reply_edits_reply_idx").on(t.discussionReplyId),
    index("discussion_reply_edits_hidden_idx").on(t.hiddenAt),
  ],
);

// One row per (post, emoji, reactor). Reactions attach to the discussion or
// reply ROW (not an edit version), so editing a post keeps its reactions.
// Toggling is insert-or-delete against the unique constraint. The fixed emoji
// set lives in $lib/reactions and is mirrored by the check constraint.
export const discussionReactions = pgTable(
  "discussion_reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discussionId: uuid("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    // Null targets the original post; set targets one reply. discussion_id is
    // carried on reply reactions too, so a whole thread's reactions are one
    // indexed query.
    discussionReplyId: uuid("discussion_reply_id").references(() => discussionReplies.id, {
      onDelete: "cascade",
    }),
    emoji: text("emoji").notNull().$type<ReactionEmoji>(),
    // Cascade (unlike authored content's restrict): reactions are weightless
    // social signals, fine to vanish with the account.
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // NULLS NOT DISTINCT so two reactions on the original post (reply id null)
    // still collide; plain unique would treat the nulls as distinct rows.
    unique("discussion_reactions_unique")
      .on(t.discussionId, t.discussionReplyId, t.emoji, t.createdByUserId)
      .nullsNotDistinct(),
    index("discussion_reactions_discussion_idx").on(t.discussionId),
    check(
      "discussion_reactions_emoji_check",
      sql`${t.emoji} IN ('+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes')`,
    ),
  ],
);
