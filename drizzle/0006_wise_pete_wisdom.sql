ALTER TABLE "inbox_messages" ADD COLUMN "subject" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "done_at" timestamp with time zone;