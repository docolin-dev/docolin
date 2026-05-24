CREATE TABLE "stamps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"source" text NOT NULL,
	"voter_user_id" uuid,
	"note" text,
	"network_bucket" text,
	"cluster_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stamps_outcome_check" CHECK ("stamps"."outcome" IN ('worked', 'worked_with_caveats', 'didnt_work')),
	CONSTRAINT "stamps_source_check" CHECK ("stamps"."source" IN ('anonymous', 'human', 'agent_read', 'agent_executed'))
);
--> statement-breakpoint
DROP MATERIALIZED VIEW "public"."latest_versions";--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "verification_score" integer;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "verification_stamp_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "verification_last_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "verification_computed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_voter_user_id_users_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stamps_version_idx" ON "stamps" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "stamps_voter_idx" ON "stamps" USING btree ("voter_user_id");--> statement-breakpoint
CREATE INDEX "stamps_version_voter_idx" ON "stamps" USING btree ("version_id","voter_user_id");--> statement-breakpoint
CREATE INDEX "stamps_network_bucket_idx" ON "stamps" USING btree ("network_bucket");--> statement-breakpoint
CREATE INDEX "stamps_cluster_idx" ON "stamps" USING btree ("cluster_id");--> statement-breakpoint
ALTER TABLE "versions" DROP COLUMN "up_votes_cache";--> statement-breakpoint
ALTER TABLE "versions" DROP COLUMN "down_votes_cache";--> statement-breakpoint
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
      v.verification_score,
      v.verification_stamp_count,
      v.verification_last_confirmed_at,
      v.embedding,
      v.published_at
    FROM docos d
    INNER JOIN versions v ON v.id = d.latest_published_version_id
  );