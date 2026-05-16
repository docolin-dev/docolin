CREATE TABLE "claim_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uid" text NOT NULL,
	"requested_slug" text NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"details" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_requests_uid_unique" UNIQUE("uid"),
	CONSTRAINT "claim_requests_status_check" CHECK ("claim_requests"."status" IN ('pending', 'approved', 'cancelled', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "inbox_messages" DROP CONSTRAINT "inbox_messages_kind_check";--> statement-breakpoint
ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_requests_slug_status_idx" ON "claim_requests" USING btree ("requested_slug","status");--> statement-breakpoint
CREATE INDEX "claim_requests_user_idx" ON "claim_requests" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "claim_requests_created_at_idx" ON "claim_requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "claim_requests_user_slug_pending_unique" ON "claim_requests" USING btree ("requested_by_user_id","requested_slug") WHERE "claim_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_kind_check" CHECK ("inbox_messages"."kind" IN ('report_filed_against_you', 'report_resolved', 'content_hidden', 'content_redacted', 'content_unhidden', 'embargo_expired', 'deletion_approved', 'deletion_denied', 'mod_decision_reversed', 'mention', 'discussion_reply', 'claim_approved', 'claim_cancelled'));