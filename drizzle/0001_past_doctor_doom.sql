CREATE TABLE "org_member_roles" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_member_roles_org_id_user_id_role_id_pk" PRIMARY KEY("org_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "org_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"badge_color" text,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_member_roles" (
	"git_source_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_member_roles_git_source_id_user_id_role_id_pk" PRIMARY KEY("git_source_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "repo_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"git_source_id" uuid NOT NULL,
	"name" text NOT NULL,
	"badge_color" text,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "docos" DROP CONSTRAINT "docos_published_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "orgs" ALTER COLUMN "workos_org_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "personal_org_id" uuid;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "admin_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "founded_by_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "upstream_provider" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "upstream_org_id" text;--> statement-breakpoint
ALTER TABLE "docos" ADD COLUMN "owner_org_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "org_member_roles" ADD CONSTRAINT "org_member_roles_role_id_org_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."org_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_member_roles" ADD CONSTRAINT "org_member_roles_member_fk" FOREIGN KEY ("org_id","user_id") REFERENCES "public"."org_members"("org_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_roles" ADD CONSTRAINT "org_roles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_member_roles" ADD CONSTRAINT "repo_member_roles_git_source_id_git_sources_id_fk" FOREIGN KEY ("git_source_id") REFERENCES "public"."git_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_member_roles" ADD CONSTRAINT "repo_member_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_member_roles" ADD CONSTRAINT "repo_member_roles_role_id_repo_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."repo_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_roles" ADD CONSTRAINT "repo_roles_git_source_id_git_sources_id_fk" FOREIGN KEY ("git_source_id") REFERENCES "public"."git_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_member_roles_user_idx" ON "org_member_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "org_member_roles_role_idx" ON "org_member_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_roles_org_name_unique" ON "org_roles" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "org_roles_org_idx" ON "org_roles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "repo_member_roles_user_idx" ON "repo_member_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "repo_member_roles_role_idx" ON "repo_member_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_roles_source_name_unique" ON "repo_roles" USING btree ("git_source_id","name");--> statement-breakpoint
CREATE INDEX "repo_roles_source_idx" ON "repo_roles" USING btree ("git_source_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_personal_org_id_orgs_id_fk" FOREIGN KEY ("personal_org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_founded_by_user_id_users_id_fk" FOREIGN KEY ("founded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docos" ADD CONSTRAINT "docos_owner_org_id_orgs_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."orgs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "docos_owner_org_idx" ON "docos" USING btree ("owner_org_id");--> statement-breakpoint
ALTER TABLE "org_members" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "docos" DROP COLUMN "published_by_user_id";--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_upstream_provider_check" CHECK ("orgs"."upstream_provider" IS NULL OR "orgs"."upstream_provider" IN ('github', 'gitlab', 'gitea', 'bitbucket', 'sourcehut'));