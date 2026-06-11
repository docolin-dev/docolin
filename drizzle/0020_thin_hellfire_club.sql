CREATE TABLE "discussion_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discussion_id" uuid NOT NULL,
	"discussion_reply_id" uuid,
	"emoji" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_reactions_unique" UNIQUE NULLS NOT DISTINCT("discussion_id","discussion_reply_id","emoji","created_by_user_id"),
	CONSTRAINT "discussion_reactions_emoji_check" CHECK ("discussion_reactions"."emoji" IN ('+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'))
);
--> statement-breakpoint
ALTER TABLE "discussion_reactions" ADD CONSTRAINT "discussion_reactions_discussion_id_discussions_id_fk" FOREIGN KEY ("discussion_id") REFERENCES "public"."discussions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_reactions" ADD CONSTRAINT "discussion_reactions_discussion_reply_id_discussion_replies_id_fk" FOREIGN KEY ("discussion_reply_id") REFERENCES "public"."discussion_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_reactions" ADD CONSTRAINT "discussion_reactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discussion_reactions_discussion_idx" ON "discussion_reactions" USING btree ("discussion_id");