import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Users, orgs, and org membership are defined together because they reference
// each other (users.personal_org_id ↔ orgs.admin_user_id), and ES module circularity
// between separate files prevents TypeScript from inferring their types.

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workosUserId: text("workos_user_id").notNull().unique(),
    handle: text("handle").notNull().unique(),
    displayName: text("display_name"),
    email: text("email"),
    // Set after signup completes; nullable only because the personal org row is
    // inserted right after the user row in the same transaction.
    personalOrgId: uuid("personal_org_id").references((): AnyPgColumn => orgs.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`)],
);

export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Optional link to a WorkOS organization for SSO. Most orgs leave this null.
    workosOrgId: text("workos_org_id").unique(),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name"),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    foundedByUserId: uuid("founded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    upstreamProvider: text("upstream_provider").$type<
      "github" | "gitlab" | "gitea" | "bitbucket" | "sourcehut"
    >(),
    upstreamOrgId: text("upstream_org_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "orgs_upstream_provider_check",
      sql`${t.upstreamProvider} IS NULL OR ${t.upstreamProvider} IN ('github', 'gitlab', 'gitea', 'bitbucket', 'sourcehut')`,
    ),
  ],
);

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

// Imported at the bottom to satisfy the forward reference in users.personalOrgId.
import type { AnyPgColumn } from "drizzle-orm/pg-core";
