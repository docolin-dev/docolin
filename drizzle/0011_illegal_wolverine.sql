ALTER TABLE "versions" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "version_tag" text;--> statement-breakpoint
CREATE INDEX "versions_commit_sha_idx" ON "versions" USING btree ("commit_sha");