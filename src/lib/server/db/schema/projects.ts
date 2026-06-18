import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

// A project is the publishing unit owned by an org. Each project has exactly
// one source (git-backed or docolin-native) and contains docos. Hard URLs
// take the shape `/{org}/{project}/{path}`.
//
// The source is attached via `git_sources.project_id` (1:1 enforced by a
// unique index on that side). source_mode lives here so consumers can ask
// "is this git or native?" without joining git_sources.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerOrgId: uuid("owner_org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    displayName: text("display_name"),
    sourceMode: text("source_mode").notNull().$type<"git" | "native">(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    // Soft delete: a deleted project keeps its row, git source, docos, and full
    // version history. Its docos are tombstoned (docos.deleted_at) so they drop
    // out of search and browse, but their URLs still serve the removed banner.
    // Recreating the same org+slug revives the project and a forced re-sync
    // un-deletes the docos still in the repo (and sweeps the ones that aren't).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Composite uniqueness: two orgs can each have a project named `docs`.
    // Holds across soft-deletes: the deleted row keeps the slug so the recreate
    // revives it instead of colliding.
    uniqueIndex("projects_org_slug_unique").on(t.ownerOrgId, t.slug),
    index("projects_owner_org_idx").on(t.ownerOrgId),
    check("projects_source_mode_check", sql`${t.sourceMode} IN ('git', 'native')`),
  ],
);
