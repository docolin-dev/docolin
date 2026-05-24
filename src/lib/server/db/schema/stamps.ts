import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { versions } from "./docos";
import { users } from "./users";

// Append-only verification ledger: one row per stamp ("worked" / "worked with
// caveats" / "didn't work") on a specific guide version, by a human or an agent.
// Rows are never mutated. The per-version reliability score is recomputed from
// this ledger off the write path, so any historical score stays auditable and
// recomputable under any future scoring-function version.
export const stamps = pgTable(
  "stamps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    // Reproducibility outcome. The scorer encodes these numerically
    // (worked = 1.0, worked-with-caveats = 0.6, didn't-work = 0.0).
    outcome: text("outcome").notNull().$type<"worked" | "worked_with_caveats" | "didnt_work">(),
    // Where the stamp came from; drives its base weight in scoring.
    source: text("source")
      .notNull()
      .$type<"anonymous" | "human" | "agent_read" | "agent_executed">(),
    // The verifier, when signed in. Null for anonymous stamps. Set null on user
    // deletion so the immutable ledger row survives (it just loses attribution).
    voterUserId: uuid("voter_user_id").references(() => users.id, { onDelete: "set null" }),
    // Optional short note, used mainly to explain a "worked with caveats".
    note: text("note"),
    // Coarse, privacy-respecting network bucket (for example a salted /24 or
    // ASN), NOT a raw IP. Used only to detect correlated clusters for diversity
    // discounting.
    networkBucket: text("network_bucket"),
    // Correlated-source cluster assigned by the anti-abuse detector; null until
    // clustered. Stamps sharing a cluster collapse via effective sample size.
    clusterId: text("cluster_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("stamps_version_idx").on(t.versionId),
    index("stamps_voter_idx").on(t.voterUserId),
    // Recompute dedupes to a voter's latest stamp per version.
    index("stamps_version_voter_idx").on(t.versionId, t.voterUserId),
    // Cluster detection groups by network bucket within time windows.
    index("stamps_network_bucket_idx").on(t.networkBucket),
    index("stamps_cluster_idx").on(t.clusterId),
    check(
      "stamps_outcome_check",
      sql`${t.outcome} IN ('worked', 'worked_with_caveats', 'didnt_work')`,
    ),
    check(
      "stamps_source_check",
      sql`${t.source} IN ('anonymous', 'human', 'agent_read', 'agent_executed')`,
    ),
  ],
);
