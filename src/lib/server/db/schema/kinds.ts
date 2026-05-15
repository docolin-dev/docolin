import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { ltree } from "./types";

// Cached projection of the kinds registry git repo. Source of truth lives elsewhere;
// this table lets us join, filter, and prefix-query against the taxonomy in SQL.
export const kinds = pgTable(
  "kinds",
  {
    path: ltree("path").primaryKey(),
    displayPath: text("display_path").notNull().unique(),
    description: text("description"),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("kinds_path_gist").using("gist", t.path)],
);
