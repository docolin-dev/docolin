CREATE EXTENSION IF NOT EXISTS "ltree";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_workos_user_id_unique" UNIQUE("workos_user_id"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_org_id" text NOT NULL,
	"slug" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_workos_org_id_unique" UNIQUE("workos_org_id"),
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "git_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"owner_org_id" uuid,
	"provider" text NOT NULL,
	"repo_url" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"webhook_secret_hash" text NOT NULL,
	"last_synced_commit" text,
	"last_synced_at" timestamp with time zone,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_sources_provider_check" CHECK ("git_sources"."provider" IN ('github', 'gitlab', 'gitea')),
	CONSTRAINT "git_sources_sync_status_check" CHECK ("git_sources"."sync_status" IN ('idle', 'syncing', 'error')),
	CONSTRAINT "git_sources_one_owner_check" CHECK (("git_sources"."owner_user_id" IS NULL) <> ("git_sources"."owner_org_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "kinds" (
	"path" "ltree" PRIMARY KEY NOT NULL,
	"display_path" text NOT NULL,
	"description" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kinds_display_path_unique" UNIQUE("display_path")
);
--> statement-breakpoint
CREATE TABLE "docos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"published_by_user_id" uuid,
	"git_source_id" uuid,
	"path_in_source" text,
	"latest_published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doco_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"kind" "ltree" NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"applies_to" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'stable' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"difficulty" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"prev_link" text,
	"next_link" text,
	"references" text[] DEFAULT '{}'::text[] NOT NULL,
	"frontmatter_extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_text" text NOT NULL,
	"body_format" text DEFAULT 'commonmark' NOT NULL,
	"up_votes_cache" integer DEFAULT 0 NOT NULL,
	"down_votes_cache" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "versions_type_check" CHECK ("versions"."type" IN ('tutorial', 'how-to', 'reference', 'explanation')),
	CONSTRAINT "versions_status_check" CHECK ("versions"."status" IN ('draft', 'stable', 'needs-update', 'deprecated')),
	CONSTRAINT "versions_difficulty_check" CHECK ("versions"."difficulty" IS NULL OR "versions"."difficulty" IN ('beginner', 'intermediate', 'advanced')),
	CONSTRAINT "versions_body_format_check" CHECK ("versions"."body_format" IN ('commonmark', 'asciidoc', 'rst', 'mdx'))
);
--> statement-breakpoint
CREATE TABLE "discussion_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discussion_id" uuid NOT NULL,
	"body_text" text NOT NULL,
	"body_format" text DEFAULT 'commonmark' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discussions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doco_id" uuid NOT NULL,
	"version_id" uuid,
	"title" text NOT NULL,
	"body_text" text NOT NULL,
	"body_format" text DEFAULT 'commonmark' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussions_status_check" CHECK ("discussions"."status" IN ('open', 'closed', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "search_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"endpoint" text NOT NULL,
	"raw_args" jsonb NOT NULL,
	"normalized_args" jsonb NOT NULL,
	"filter_context" jsonb,
	"cache_hit" boolean NOT NULL,
	"retrieved_doco_ids" uuid[],
	"top_doco_id" uuid,
	"latency_ms" integer NOT NULL,
	"user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_sources" ADD CONSTRAINT "git_sources_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_sources" ADD CONSTRAINT "git_sources_owner_org_id_orgs_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docos" ADD CONSTRAINT "docos_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docos" ADD CONSTRAINT "docos_git_source_id_git_sources_id_fk" FOREIGN KEY ("git_source_id") REFERENCES "public"."git_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_doco_id_docos_id_fk" FOREIGN KEY ("doco_id") REFERENCES "public"."docos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_discussion_id_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_doco_id_docos_id_fk" FOREIGN KEY ("doco_id") REFERENCES "public"."docos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "git_sources_provider_repo_unique" ON "git_sources" USING btree ("provider","repo_url");--> statement-breakpoint
CREATE INDEX "git_sources_owner_user_idx" ON "git_sources" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "git_sources_owner_org_idx" ON "git_sources" USING btree ("owner_org_id");--> statement-breakpoint
CREATE INDEX "kinds_path_gist" ON "kinds" USING gist ("path");--> statement-breakpoint
CREATE INDEX "docos_git_source_idx" ON "docos" USING btree ("git_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "docos_git_source_path_unique" ON "docos" USING btree ("git_source_id","path_in_source") WHERE "docos"."git_source_id" IS NOT NULL AND "docos"."path_in_source" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "versions_doco_version_unique" ON "versions" USING btree ("doco_id","version_number");--> statement-breakpoint
CREATE INDEX "versions_doco_idx" ON "versions" USING btree ("doco_id");--> statement-breakpoint
CREATE INDEX "versions_kind_gist" ON "versions" USING gist ("kind");--> statement-breakpoint
CREATE INDEX "versions_status_idx" ON "versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "versions_type_idx" ON "versions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "versions_language_idx" ON "versions" USING btree ("language");--> statement-breakpoint
CREATE INDEX "versions_published_at_idx" ON "versions" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "discussion_replies_discussion_idx" ON "discussion_replies" USING btree ("discussion_id");--> statement-breakpoint
CREATE INDEX "discussion_replies_created_at_idx" ON "discussion_replies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "discussions_doco_idx" ON "discussions" USING btree ("doco_id");--> statement-breakpoint
CREATE INDEX "discussions_status_idx" ON "discussions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "discussions_created_by_idx" ON "discussions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "search_logs_timestamp_idx" ON "search_logs" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "search_logs_endpoint_idx" ON "search_logs" USING btree ("endpoint");--> statement-breakpoint
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
      v.aliases,
      v.body_text,
      v.body_format,
      v.up_votes_cache,
      v.down_votes_cache,
      v.embedding,
      v.published_at
    FROM docos d
    INNER JOIN versions v ON v.id = d.latest_published_version_id
  );