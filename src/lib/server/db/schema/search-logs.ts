import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Async-written log of every search call. Foundation for cache-tuning, paraphrase
// clustering, content-gap detection, and future custom-reranker training.
export const searchLogs = pgTable(
  "search_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
    endpoint: text("endpoint").notNull().$type<"search.structured" | "search.free">(),
    rawArgs: jsonb("raw_args").notNull(),
    normalizedArgs: jsonb("normalized_args").notNull(),
    filterContext: jsonb("filter_context"),
    cacheHit: boolean("cache_hit").notNull(),
    retrievedDocoIds: uuid("retrieved_doco_ids").array(),
    topDocoId: uuid("top_doco_id"),
    latencyMs: integer("latency_ms").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("search_logs_timestamp_idx").on(t.timestamp.desc()),
    index("search_logs_endpoint_idx").on(t.endpoint),
  ],
);
