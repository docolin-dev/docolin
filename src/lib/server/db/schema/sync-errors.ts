import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

// Per-file errors surfaced from a sync run. Lives separately from versions
// because a file with bad frontmatter never produces a version row in the
// first place; the error is what the project owner needs to see to fix it.
//
// One row per (project, file_path). UPSERT on each sync: the latest error
// state replaces the previous. When a subsequent sync parses the file
// cleanly, the row is deleted.
export const syncFileErrors = pgTable(
  "sync_file_errors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    // Machine-readable code so the UI can group, filter, and offer
    // code-specific guidance (e.g. an AI prompt to add missing frontmatter).
    errorCode: text("error_code").notNull(),
    errorMessage: text("error_message").notNull(),
    // Structured payload for codes that carry extra context (which fields are
    // missing, which handle didn't resolve, which asset is oversized, etc.).
    errorDetails: jsonb("error_details")
      .notNull()
      .default(sql`'{}'::jsonb`),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("sync_file_errors_project_path_unique").on(t.projectId, t.filePath),
    index("sync_file_errors_project_idx").on(t.projectId),
    index("sync_file_errors_code_idx").on(t.errorCode),
  ],
);
