import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { gitSources } from "./git-sources";
import { orgs, orgMembers } from "./orgs";
import { users } from "./users";

// Org-level roles. Apply to all docos owned by the org. Granted via `org_member_roles`,
// which requires the user to also be in `org_members`.
export const orgRoles = pgTable(
  "org_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    badgeColor: text("badge_color"),
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
    isSystemDefault: boolean("is_system_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("org_roles_org_name_unique").on(t.orgId, t.name),
    index("org_roles_org_idx").on(t.orgId),
  ],
);

export const orgMemberRoles = pgTable(
  "org_member_roles",
  {
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => orgRoles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId, t.roleId] }),
    // Composite FK ensures roles can only be assigned to actual org members.
    foreignKey({
      columns: [t.orgId, t.userId],
      foreignColumns: [orgMembers.orgId, orgMembers.userId],
      name: "org_member_roles_member_fk",
    }).onDelete("cascade"),
    index("org_member_roles_user_idx").on(t.userId),
    index("org_member_roles_role_idx").on(t.roleId),
  ],
);

// Repo-level roles. Apply only to docos belonging to the given git source. Additive
// to org-level roles; never subtract. Repo roles do NOT require org membership, so
// an external contributor can be granted repo-mod rights without joining the org.
export const repoRoles = pgTable(
  "repo_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gitSourceId: uuid("git_source_id")
      .notNull()
      .references(() => gitSources.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    badgeColor: text("badge_color"),
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
    isSystemDefault: boolean("is_system_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("repo_roles_source_name_unique").on(t.gitSourceId, t.name),
    index("repo_roles_source_idx").on(t.gitSourceId),
  ],
);

export const repoMemberRoles = pgTable(
  "repo_member_roles",
  {
    gitSourceId: uuid("git_source_id")
      .notNull()
      .references(() => gitSources.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => repoRoles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.gitSourceId, t.userId, t.roleId] }),
    index("repo_member_roles_user_idx").on(t.userId),
    index("repo_member_roles_role_idx").on(t.roleId),
  ],
);
