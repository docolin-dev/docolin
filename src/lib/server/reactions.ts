import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { discussionReactions, discussionReplies } from "$lib/server/db/schema";
import type { ReactionEmoji } from "$lib/reactions";

// Reactions on a discussion thread. Counts are public and render into the
// cached thread HTML (purged on toggle, like replies); which reactions the
// viewer made is per-user and hydrates client-side from the API route.

/** Per-target reaction counts, keyed "op" for the original post and the reply
 *  id for replies. Only emojis with at least one reaction appear; targets with
 *  none are absent (hence the explicit undefined in the value type). */
export type ThreadReactionCounts = Record<
  string,
  Partial<Record<ReactionEmoji, number>> | undefined
>;

function targetKey(replyId: string | null): string {
  return replyId ?? "op";
}

export async function getThreadReactions(discussionId: string): Promise<ThreadReactionCounts> {
  const rows = await db
    .select({
      replyId: discussionReactions.discussionReplyId,
      emoji: discussionReactions.emoji,
      n: count(),
    })
    .from(discussionReactions)
    .where(eq(discussionReactions.discussionId, discussionId))
    .groupBy(discussionReactions.discussionReplyId, discussionReactions.emoji);

  const out: ThreadReactionCounts = {};
  for (const row of rows) {
    const key = targetKey(row.replyId);
    (out[key] ??= {})[row.emoji] = row.n;
  }
  return out;
}

/** The viewer's own reactions in a thread, as "op:heart" / "{replyId}:+1"
 *  keys, the shape the reaction bar checks before highlighting a chip. */
export async function getViewerReactions(discussionId: string, userId: string): Promise<string[]> {
  const rows = await db
    .select({
      replyId: discussionReactions.discussionReplyId,
      emoji: discussionReactions.emoji,
    })
    .from(discussionReactions)
    .where(
      and(
        eq(discussionReactions.discussionId, discussionId),
        eq(discussionReactions.createdByUserId, userId),
      ),
    );
  return rows.map((row) => `${targetKey(row.replyId)}:${row.emoji}`);
}

export interface ToggleReactionInput {
  discussionId: string;
  /** Null reacts to the original post. */
  replyId: string | null;
  emoji: ReactionEmoji;
  userId: string;
}

/** Adds the reaction, or removes it when it already exists (the second click
 *  of a toggle). Returns false when the target reply doesn't belong to the
 *  discussion (a crafted request, not a UI state). */
export async function toggleReaction(input: ToggleReactionInput): Promise<boolean> {
  if (input.replyId !== null) {
    const replyRows = await db
      .select({ id: discussionReplies.id })
      .from(discussionReplies)
      .where(
        and(
          eq(discussionReplies.id, input.replyId),
          eq(discussionReplies.discussionId, input.discussionId),
          isNull(discussionReplies.hiddenAt),
        ),
      );
    if (replyRows.length === 0) return false;
  }

  const inserted = await db
    .insert(discussionReactions)
    .values({
      discussionId: input.discussionId,
      discussionReplyId: input.replyId,
      emoji: input.emoji,
      createdByUserId: input.userId,
    })
    .onConflictDoNothing()
    .returning({ id: discussionReactions.id });
  if (inserted.length > 0) return true;

  // Conflict means the row exists: this click is the toggle-off.
  await db
    .delete(discussionReactions)
    .where(
      and(
        eq(discussionReactions.discussionId, input.discussionId),
        input.replyId === null
          ? sql`${discussionReactions.discussionReplyId} IS NULL`
          : eq(discussionReactions.discussionReplyId, input.replyId),
        eq(discussionReactions.emoji, input.emoji),
        eq(discussionReactions.createdByUserId, input.userId),
      ),
    );
  return true;
}
