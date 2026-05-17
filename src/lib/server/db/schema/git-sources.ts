import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

// One source per project (enforced by the unique index on project_id).
// Source ownership flows up via the project row, so this table no longer
// carries user/org ownership directly.
export const gitSources = pgTable(
  "git_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().$type<"github" | "gitlab" | "gitea">(),
    repoUrl: text("repo_url").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    // Optional subdirectory inside the repo where docs live (e.g. "docs/").
    // Null = repo root. Surfaced as a form field on project create.
    subpath: text("subpath"),
    // Stored hashed; raw secret never round-trips through the database.
    // Nullable: projects without a configured webhook rely on polling only.
    // The webhook is an optional power-user opt-in for instant updates on top.
    webhookSecretHash: text("webhook_secret_hash"),
    lastSyncedCommit: text("last_synced_commit"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncStatus: text("sync_status").notNull().default("idle").$type<"idle" | "syncing" | "error">(),
    syncError: text("sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Enforces the one-source-per-project rule.
    uniqueIndex("git_sources_project_unique").on(t.projectId),
    uniqueIndex("git_sources_provider_repo_unique").on(t.provider, t.repoUrl),
    check("git_sources_provider_check", sql`${t.provider} IN ('github', 'gitlab', 'gitea')`),
    check("git_sources_sync_status_check", sql`${t.syncStatus} IN ('idle', 'syncing', 'error')`),
  ],
);
