import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// Claim requests for pre-reserved handles. When a user tries to claim a name
// belonging to a real-world entity (e.g. `nvidia`, `wikipedia`, `mit`), a
// claim_request row is filed and a UID is shown to the user. They email
// support from the entity's verified domain quoting the UID; an admin checks
// the From: domain matches the requested slug and approves.
//
// Multiple pending claims for the same slug can coexist (no exclusive lock on
// the name during the claim window). When one is approved, all other pending
// claims for the same slug are cascade-cancelled.
export const claimRequests = pgTable(
  "claim_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Short human-friendly token for quoting in support emails (e.g. 'clm-xyz123').
    uid: text("uid").notNull().unique(),
    requestedSlug: text("requested_slug").notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Optional free-text justification from the user.
    details: text("details"),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "approved" | "cancelled" | "expired">(),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("claim_requests_slug_status_idx").on(t.requestedSlug, t.status),
    index("claim_requests_user_idx").on(t.requestedByUserId),
    index("claim_requests_created_at_idx").on(t.createdAt.desc()),
    uniqueIndex("claim_requests_user_slug_pending_unique")
      .on(t.requestedByUserId, t.requestedSlug)
      .where(sql`${t.status} = 'pending'`),
    check(
      "claim_requests_status_check",
      sql`${t.status} IN ('pending', 'approved', 'cancelled', 'expired')`,
    ),
  ],
);
