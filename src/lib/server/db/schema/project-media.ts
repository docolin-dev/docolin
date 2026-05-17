import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

// Sync-archived media. Images referenced from doco bodies that the sync
// engine downloaded (when <= 50MB) and re-uploaded to R2 so the content
// survives source-repo removal.
//
// Distinct from `media_uploads`, which is for user-uploaded content (commit-
// or-cleanup TTL semantics). Sync-archived assets are always committed,
// owned by a project not a user, and follow the project's lifecycle.
//
// Per-project hash dedup: the same image referenced from multiple docos in
// the same project uploads once. Cross-project dedup is intentionally NOT
// done (simpler lifecycle, project deletion cleanly cascades all assets).
export const projectMediaAssets = pgTable(
  "project_media_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // sha256 of the asset bytes. Drives dedup and the R2 storage key.
    contentHash: text("content_hash").notNull(),
    // Public R2 URL the body markdown is rewritten to. Stored so the renderer
    // doesn't need to reconstruct it from the hash + project on every read.
    url: text("url").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    // First commit ref the asset was seen in; useful for debugging when an
    // asset's source path or content changes across history.
    firstSeenRef: text("first_seen_ref"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("project_media_assets_project_hash_unique").on(t.projectId, t.contentHash),
    index("project_media_assets_project_idx").on(t.projectId),
  ],
);
