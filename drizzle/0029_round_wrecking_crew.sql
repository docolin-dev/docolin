CREATE TABLE "sync_jobs" (
	"git_source_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"phase" text DEFAULT 'pending' NOT NULL,
	"force" boolean DEFAULT false NOT NULL,
	"plan" jsonb,
	"pending" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changed_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"planned_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_jobs_phase_check" CHECK ("sync_jobs"."phase" IN ('pending', 'processing', 'finalizing'))
);
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_git_source_id_git_sources_id_fk" FOREIGN KEY ("git_source_id") REFERENCES "public"."git_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_jobs_lease_until_idx" ON "sync_jobs" USING btree ("lease_until");