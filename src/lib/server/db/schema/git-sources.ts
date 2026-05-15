import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { users } from "./users";

export const gitSources = pgTable(
  "git_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    ownerOrgId: uuid("owner_org_id").references(() => orgs.id, { onDelete: "set null" }),
    provider: text("provider").notNull().$type<"github" | "gitlab" | "gitea">(),
    repoUrl: text("repo_url").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    // Stored hashed; raw secret never round-trips through the database.
    webhookSecretHash: text("webhook_secret_hash").notNull(),
    lastSyncedCommit: text("last_synced_commit"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncStatus: text("sync_status").notNull().default("idle").$type<"idle" | "syncing" | "error">(),
    syncError: text("sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("git_sources_provider_check", sql`${t.provider} IN ('github', 'gitlab', 'gitea')`),
    check("git_sources_sync_status_check", sql`${t.syncStatus} IN ('idle', 'syncing', 'error')`),
    // Exactly one owner: user xor org.
    check(
      "git_sources_one_owner_check",
      sql`(${t.ownerUserId} IS NULL) <> (${t.ownerOrgId} IS NULL)`,
    ),
    uniqueIndex("git_sources_provider_repo_unique").on(t.provider, t.repoUrl),
    index("git_sources_owner_user_idx").on(t.ownerUserId),
    index("git_sources_owner_org_idx").on(t.ownerOrgId),
  ],
);
