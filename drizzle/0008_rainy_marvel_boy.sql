ALTER TABLE "git_sources" ALTER COLUMN "webhook_secret_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "git_sources" ADD COLUMN "subpath" text;