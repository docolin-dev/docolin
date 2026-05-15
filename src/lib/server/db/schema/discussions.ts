import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { docos, versions } from "./docos";
import { users } from "./users";

export const discussions = pgTable(
  "discussions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    docoId: uuid("doco_id")
      .notNull()
      .references(() => docos.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => versions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    bodyText: text("body_text").notNull(),
    bodyFormat: text("body_format").notNull().default("commonmark").$type<"commonmark">(),
    status: text("status").notNull().default("open").$type<"open" | "closed" | "resolved">(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("discussions_doco_idx").on(t.docoId),
    index("discussions_status_idx").on(t.status),
    index("discussions_created_by_idx").on(t.createdByUserId),
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
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("discussion_replies_discussion_idx").on(t.discussionId),
    index("discussion_replies_created_at_idx").on(t.createdAt),
  ],
);
