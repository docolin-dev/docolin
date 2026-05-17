CREATE TABLE "project_media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint NOT NULL,
	"first_seen_ref" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_file_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"error_code" text NOT NULL,
	"error_message" text NOT NULL,
	"error_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP MATERIALIZED VIEW "public"."latest_versions";--> statement-breakpoint
ALTER TABLE "versions" DROP CONSTRAINT "versions_difficulty_check";--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "time_estimate_min_minutes" integer;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "time_estimate_max_minutes" integer;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "superseded_by" text;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "authors" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "sitemap" jsonb;--> statement-breakpoint
ALTER TABLE "project_media_assets" ADD CONSTRAINT "project_media_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_file_errors" ADD CONSTRAINT "sync_file_errors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_media_assets_project_hash_unique" ON "project_media_assets" USING btree ("project_id","content_hash");--> statement-breakpoint
CREATE INDEX "project_media_assets_project_idx" ON "project_media_assets" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_file_errors_project_path_unique" ON "sync_file_errors" USING btree ("project_id","file_path");--> statement-breakpoint
CREATE INDEX "sync_file_errors_project_idx" ON "sync_file_errors" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sync_file_errors_code_idx" ON "sync_file_errors" USING btree ("error_code");--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_time_estimate_range_check" CHECK ("versions"."time_estimate_min_minutes" IS NULL OR "versions"."time_estimate_max_minutes" IS NULL OR "versions"."time_estimate_max_minutes" >= "versions"."time_estimate_min_minutes");--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_difficulty_check" CHECK ("versions"."difficulty" IS NULL OR "versions"."difficulty" IN ('beginner', 'intermediate', 'advanced', 'expert'));--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."latest_versions" AS (
    SELECT
      d.id AS doco_id,
      v.id AS version_id,
      v.version_number,
      v.kind,
      v.type,
      v.title,
      v.description,
      v.applies_to,
      v.status,
      v.language,
      v.difficulty,
      v.time_estimate_min_minutes,
      v.time_estimate_max_minutes,
      v.aliases,
      v.prev_link,
      v.next_link,
      v.superseded_by,
      v.references,
      v.authors,
      v.sitemap,
      v.body_text,
      v.body_format,
      v.up_votes_cache,
      v.down_votes_cache,
      v.embedding,
      v.published_at
    FROM docos d
    INNER JOIN versions v ON v.id = d.latest_published_version_id
  );