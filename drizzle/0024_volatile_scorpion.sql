ALTER TABLE "discussion_reactions" DROP CONSTRAINT "discussion_reactions_discussion_reply_id_discussion_replies_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_replies_id_discussion_unique" ON "discussion_replies" USING btree ("id","discussion_id");