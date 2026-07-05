import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
  discussionEdits,
  discussionReplies,
  discussionReplyEdits,
  discussions,
  docos,
  inboxMessages,
  users,
} from "$lib/server/db/schema";
import { renderDiscussionMarkdown } from "$lib/server/markdown";
import { extractMentionHandles } from "$lib/mentions";

// Data + mutation layer for doco discussions. Discussions are GitHub-issues
// for a doco: a titled thread opened by a user, with a flat (never nested)
// reply timeline. Reads here are public and fed into edge-cached load
// functions; writes happen through form actions that purge the cache and
// fan out inbox notifications afterwards.

export type DiscussionStatus = "open" | "closed" | "resolved";

// Visibility for public reads. Content is hidden when hiddenAt is set, unless an
// embargo window (hiddenUntil) has already elapsed, in which case the hide
// auto-reverses. Redacted content stays visible: redaction edits the body in
// place (scrubbing the offending part), so the current body is safe to show.
function discussionIsVisible(): SQL | undefined {
  return or(
    isNull(discussions.hiddenAt),
    sql`${discussions.hiddenUntil} is not null and ${discussions.hiddenUntil} <= now()`,
  );
}

// Same rule applied in JS to any row carrying hide columns (replies and
// edit-history versions), which we fetch in full (including hidden ones) so the
// timeline can render a neutral "removed" placeholder rather than silently
// dropping a row. Redacted rows stay visible (their body was scrubbed in place).
function contentRowIsVisible(r: { hiddenAt: Date | null; hiddenUntil: Date | null }): boolean {
  if (r.hiddenAt === null) return true;
  return r.hiddenUntil !== null && r.hiddenUntil.getTime() <= Date.now();
}

// Moderation gate. Platform admins moderate everything; the owning org's admin
// moderates its docos. Author-of-the-thread powers are checked separately at
// the call sites (the author can edit / change status on their own thread).
// Extension point: honor org/repo roles that grant a moderation permission
// (schema/roles.ts) once a permission-string convention is established.
export function canModerateDiscussion(args: {
  user: { id: string; isPlatformAdmin: boolean } | null;
  ownerOrgAdminUserId: string;
}): boolean {
  if (args.user === null) return false;
  if (args.user.isPlatformAdmin) return true;
  return args.user.id === args.ownerOrgAdminUserId;
}

export interface ThreadListItem {
  id: string;
  number: number;
  title: string;
  status: DiscussionStatus;
  isPinned: boolean;
  isAnswered: boolean;
  authorHandle: string;
  authorDisplayName: string | null;
  // True when the author's account is tombstoned (deletedAt set) or missing.
  // The identity above is blanked in that case; renderers show a neutral
  // "deleted account" label with no profile link.
  authorDeleted: boolean;
  replyCount: number;
  lastActivityAt: string;
}

// Cap on the per-doco list. At pre-alpha volume this is plenty; a "load more"
// page is the follow-up if a doco ever outgrows it. Bounds the query (no
// unbounded fetch) the same way the inbox list caps at 100.
const THREAD_LIST_LIMIT = 100;

// Filter for the list tabs: "open", "closed" (which means not-open, i.e. both
// closed and resolved), or "all".
export type ThreadFilter = "open" | "closed" | "all";

// Per-doco thread list: pinned first, then most recent activity. Hidden /
// redacted threads are filtered out; reply counts include visible replies only.
// updatedAt is bumped on every reply / edit / status change, so it tracks
// activity without a max(reply) aggregate.
export async function listThreads(docoId: string, filter: ThreadFilter): Promise<ThreadListItem[]> {
  const conds = [eq(discussions.docoId, docoId), discussionIsVisible()];
  if (filter === "open") conds.push(eq(discussions.status, "open"));
  else if (filter === "closed") conds.push(inArray(discussions.status, ["closed", "resolved"]));

  const rows = await db
    .select({
      id: discussions.id,
      number: discussions.number,
      title: discussions.title,
      status: discussions.status,
      pinnedAt: discussions.pinnedAt,
      answeredReplyId: discussions.answeredReplyId,
      updatedAt: discussions.updatedAt,
      authorHandle: users.handle,
      authorDisplayName: users.displayName,
      authorDeletedAt: users.deletedAt,
    })
    .from(discussions)
    .innerJoin(users, eq(users.id, discussions.createdByUserId))
    .where(and(...conds))
    .orderBy(sql`${discussions.pinnedAt} desc nulls last`, desc(discussions.updatedAt))
    .limit(THREAD_LIST_LIMIT);

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const aggRows = await db
      .select({ discussionId: discussionReplies.discussionId, c: count() })
      .from(discussionReplies)
      .where(
        and(
          inArray(discussionReplies.discussionId, ids),
          or(
            isNull(discussionReplies.hiddenAt),
            sql`${discussionReplies.hiddenUntil} is not null and ${discussionReplies.hiddenUntil} <= now()`,
          ),
        ),
      )
      .groupBy(discussionReplies.discussionId);
    for (const a of aggRows) counts.set(a.discussionId, a.c);
  }

  return rows.map((r) => {
    // A tombstoned author keeps the thread but loses its identity here, so a
    // renderer that forgets the `authorDeleted` flag still can't leak the
    // retired handle.
    const authorDeleted = r.authorDeletedAt !== null;
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      status: r.status,
      isPinned: r.pinnedAt !== null,
      isAnswered: r.answeredReplyId !== null,
      authorHandle: authorDeleted ? "" : r.authorHandle,
      authorDisplayName: authorDeleted ? null : r.authorDisplayName,
      authorDeleted,
      replyCount: counts.get(r.id) ?? 0,
      lastActivityAt: r.updatedAt.toISOString(),
    };
  });
}

export interface ThreadPost {
  id: string;
  authorHandle: string;
  authorDisplayName: string | null;
  // True when the author's account is tombstoned (deletedAt set) or missing.
  // The identity above is blanked in that case; renderers show a neutral
  // "deleted account" label with no profile link.
  authorDeleted: boolean;
  bodyHtml: string;
  // Raw markdown source, so the author's inline edit form can prefill with the
  // original text. Public content (same as the rendered body), so exposing it
  // is fine. Empty on removed-placeholder rows.
  bodySource: string;
  createdAt: string;
  isEdited: boolean;
}

export interface ThreadReply extends ThreadPost {
  // True when this reply is by the thread's original author (a quiet "author"
  // marker, like GitHub). False on removed-placeholder rows.
  isOpAuthor: boolean;
  // True when this reply is the thread's accepted answer.
  isAnswer: boolean;
  // When true, the reply was hidden / redacted: body and author are blanked
  // and the UI renders a "this content was removed" placeholder in its slot.
  removed: boolean;
}

export interface ThreadDetail {
  id: string;
  number: number;
  title: string;
  status: DiscussionStatus;
  isPinned: boolean;
  // Id of the accepted-answer reply, or null. Lets the UI render the "answered"
  // banner + jump link without scanning replies.
  answeredReplyId: string | null;
  op: ThreadPost;
  replies: ThreadReply[];
  // True when the reply list was capped (more replies exist than were returned).
  repliesTruncated: boolean;
}

// Cap on replies returned for a thread. Threads this long are rare in practice;
// "load more" pagination is the follow-up. Bounds the query.
const REPLY_LIMIT = 200;

// Full thread for the detail page: the original post plus the flat reply
// timeline, markdown rendered to sanitized HTML. Looked up by its per-doco
// number (the #N from the URL), scoped to the doco so a number under the wrong
// doco path 404s. Returns null when missing or not publicly visible.
export async function getThread(docoId: string, number: number): Promise<ThreadDetail | null> {
  const dRows = await db
    .select({
      id: discussions.id,
      number: discussions.number,
      title: discussions.title,
      status: discussions.status,
      pinnedAt: discussions.pinnedAt,
      answeredReplyId: discussions.answeredReplyId,
      bodyText: discussions.bodyText,
      createdAt: discussions.createdAt,
      createdByUserId: discussions.createdByUserId,
      authorHandle: users.handle,
      authorDisplayName: users.displayName,
      authorDeletedAt: users.deletedAt,
    })
    .from(discussions)
    .innerJoin(users, eq(users.id, discussions.createdByUserId))
    .where(
      and(eq(discussions.docoId, docoId), eq(discussions.number, number), discussionIsVisible()),
    )
    .limit(1);
  if (dRows.length === 0) return null;
  const d = dRows[0];

  // Fetch one extra to detect overflow, then cap.
  const rRowsRaw = await db
    .select({
      id: discussionReplies.id,
      bodyText: discussionReplies.bodyText,
      createdAt: discussionReplies.createdAt,
      isRedacted: discussionReplies.isRedacted,
      hiddenAt: discussionReplies.hiddenAt,
      hiddenUntil: discussionReplies.hiddenUntil,
      createdByUserId: discussionReplies.createdByUserId,
      authorHandle: users.handle,
      authorDisplayName: users.displayName,
      authorDeletedAt: users.deletedAt,
    })
    .from(discussionReplies)
    .innerJoin(users, eq(users.id, discussionReplies.createdByUserId))
    .where(eq(discussionReplies.discussionId, d.id))
    .orderBy(asc(discussionReplies.createdAt))
    .limit(REPLY_LIMIT + 1);
  const repliesTruncated = rRowsRaw.length > REPLY_LIMIT;
  const rRows = repliesTruncated ? rRowsRaw.slice(0, REPLY_LIMIT) : rRowsRaw;

  // Edit markers: a post is "edited" when at least one history row exists.
  const opEditedRows = await db
    .select({ id: discussionEdits.id })
    .from(discussionEdits)
    .where(eq(discussionEdits.discussionId, d.id))
    .limit(1);
  const visibleReplyIds = rRows.filter(contentRowIsVisible).map((r) => r.id);
  const editedReplyIds = new Set<string>();
  if (visibleReplyIds.length > 0) {
    const editedRows = await db
      .selectDistinct({ id: discussionReplyEdits.discussionReplyId })
      .from(discussionReplyEdits)
      .where(inArray(discussionReplyEdits.discussionReplyId, visibleReplyIds));
    for (const e of editedRows) editedReplyIds.add(e.id);
  }

  const replies: ThreadReply[] = await Promise.all(
    rRows.map(async (r): Promise<ThreadReply> => {
      if (!contentRowIsVisible(r)) {
        return {
          id: r.id,
          authorHandle: "",
          authorDisplayName: null,
          authorDeleted: true,
          bodyHtml: "",
          bodySource: "",
          createdAt: r.createdAt.toISOString(),
          isEdited: false,
          isOpAuthor: false,
          isAnswer: false,
          removed: true,
        };
      }
      // A tombstoned author keeps the reply but loses its identity here (defence
      // in depth), so a renderer that forgets the flag can't leak the handle.
      const authorDeleted = r.authorDeletedAt !== null;
      return {
        id: r.id,
        authorHandle: authorDeleted ? "" : r.authorHandle,
        authorDisplayName: authorDeleted ? null : r.authorDisplayName,
        authorDeleted,
        bodyHtml: await renderDiscussionMarkdown(r.bodyText),
        bodySource: r.bodyText,
        createdAt: r.createdAt.toISOString(),
        isEdited: editedReplyIds.has(r.id),
        isOpAuthor: r.createdByUserId === d.createdByUserId,
        isAnswer: r.id === d.answeredReplyId,
        removed: false,
      };
    }),
  );

  // A tombstoned op author keeps the thread but loses its identity here
  // (defence in depth), so a renderer that forgets the flag can't leak the
  // retired handle.
  const opDeleted = d.authorDeletedAt !== null;
  return {
    id: d.id,
    number: d.number,
    title: d.title,
    status: d.status,
    isPinned: d.pinnedAt !== null,
    answeredReplyId: d.answeredReplyId,
    op: {
      id: d.id,
      authorHandle: opDeleted ? "" : d.authorHandle,
      authorDisplayName: opDeleted ? null : d.authorDisplayName,
      authorDeleted: opDeleted,
      bodyHtml: await renderDiscussionMarkdown(d.bodyText),
      bodySource: d.bodyText,
      createdAt: d.createdAt.toISOString(),
      isEdited: opEditedRows.length > 0,
    },
    replies,
    repliesTruncated,
  };
}

export type MutationResult = { ok: true } | { ok: false; reason: "not_found" | "forbidden" };

// Creates a discussion with the next per-doco number. The number comes from an
// atomic increment of docos.discussion_seq (UPDATE ... RETURNING locks the doco
// row), so concurrent creates can't collide. Wrapped in a transaction so a
// failed insert doesn't burn a number mid-flight. Returns the id + number for
// building the new thread's URL.
export async function createDiscussion(args: {
  docoId: string;
  title: string;
  bodyText: string;
  userId: string;
}): Promise<{ id: string; number: number }> {
  return db.transaction(async (tx) => {
    const seqRows = await tx
      .update(docos)
      .set({ discussionSeq: sql`${docos.discussionSeq} + 1`, updatedAt: new Date() })
      .where(eq(docos.id, args.docoId))
      .returning({ number: docos.discussionSeq });
    const number = seqRows[0].number;

    const rows = await tx
      .insert(discussions)
      .values({
        docoId: args.docoId,
        number,
        title: args.title,
        bodyText: args.bodyText,
        createdByUserId: args.userId,
      })
      .returning({ id: discussions.id });
    return { id: rows[0].id, number };
  });
}

// Resolves a thread's row identity from its per-doco number, for action
// handlers that need the id (to mutate) plus the number + title (to build the
// canonical URL for redirects and cache purges). Scoped to the doco.
export async function getDiscussionRef(
  docoId: string,
  number: number,
): Promise<{ id: string; number: number; title: string } | null> {
  const rows = await db
    .select({ id: discussions.id, number: discussions.number, title: discussions.title })
    .from(discussions)
    .where(and(eq(discussions.docoId, docoId), eq(discussions.number, number)))
    .limit(1);
  return rows[0] ?? null;
}

export interface EditVersion {
  // Edit-history row id, so per-version moderation (report / hide / redact a
  // single prior body) can target this version on its own.
  id: string;
  editedAt: string;
  bodyHtml: string;
  // Raw markdown of this prior version (public content, like ThreadPost
  // bodySource); the raw markdown endpoints render the history from this.
  bodySource: string;
  // True when this prior version was hidden / redacted: body is blanked and the
  // UI shows a "removed" placeholder, the same treatment as a removed reply.
  removed: boolean;
}

// Renders one edit-history row, blanking the body when the version itself has
// been hidden or redacted (a leak can live in a prior body the author already
// edited out of the live one, so versions are moderated individually).
async function renderEditVersion(r: {
  id: string;
  priorBodyText: string;
  editedAt: Date;
  isRedacted: boolean;
  hiddenAt: Date | null;
  hiddenUntil: Date | null;
}): Promise<EditVersion> {
  if (!contentRowIsVisible(r)) {
    return {
      id: r.id,
      editedAt: r.editedAt.toISOString(),
      bodyHtml: "",
      bodySource: "",
      removed: true,
    };
  }
  return {
    id: r.id,
    editedAt: r.editedAt.toISOString(),
    bodyHtml: await renderDiscussionMarkdown(r.priorBodyText),
    bodySource: r.priorBodyText,
    removed: false,
  };
}

// Prior versions of a post, newest first, rendered to sanitized HTML. Edit
// history is public per the moderation policy (it's part of the doco's record;
// truly sensitive removal goes through redaction, which destroys the original).
// Returns null when the post isn't publicly visible, so hidden / redacted
// content's history isn't exposed either. Loaded on demand (only when a reader
// opens the "edited" history), so it never bloats the thread payload.
export async function getDiscussionEditHistory(
  discussionId: string,
): Promise<EditVersion[] | null> {
  const vis = await db
    .select({ id: discussions.id })
    .from(discussions)
    .where(and(eq(discussions.id, discussionId), discussionIsVisible()))
    .limit(1);
  if (vis.length === 0) return null;

  const rows = await db
    .select({
      id: discussionEdits.id,
      priorBodyText: discussionEdits.priorBodyText,
      editedAt: discussionEdits.editedAt,
      isRedacted: discussionEdits.isRedacted,
      hiddenAt: discussionEdits.hiddenAt,
      hiddenUntil: discussionEdits.hiddenUntil,
    })
    .from(discussionEdits)
    .where(eq(discussionEdits.discussionId, discussionId))
    .orderBy(desc(discussionEdits.editedAt));
  return Promise.all(rows.map((r) => renderEditVersion(r)));
}

export async function getReplyEditHistory(replyId: string): Promise<EditVersion[] | null> {
  const vis = await db
    .select({
      isRedacted: discussionReplies.isRedacted,
      hiddenAt: discussionReplies.hiddenAt,
      hiddenUntil: discussionReplies.hiddenUntil,
    })
    .from(discussionReplies)
    .where(eq(discussionReplies.id, replyId))
    .limit(1);
  if (vis.length === 0 || !contentRowIsVisible(vis[0])) return null;

  const rows = await db
    .select({
      id: discussionReplyEdits.id,
      priorBodyText: discussionReplyEdits.priorBodyText,
      editedAt: discussionReplyEdits.editedAt,
      isRedacted: discussionReplyEdits.isRedacted,
      hiddenAt: discussionReplyEdits.hiddenAt,
      hiddenUntil: discussionReplyEdits.hiddenUntil,
    })
    .from(discussionReplyEdits)
    .where(eq(discussionReplyEdits.discussionReplyId, replyId))
    .orderBy(desc(discussionReplyEdits.editedAt));
  return Promise.all(rows.map((r) => renderEditVersion(r)));
}

// Reply to a thread. Allowed on closed / resolved threads too (matching
// GitHub, where you can still comment after close). Returns null when the
// thread is missing or not visible. Bumps the thread's updatedAt so activity
// sorting and cache keys reflect the new reply.
export async function createReply(args: {
  discussionId: string;
  bodyText: string;
  userId: string;
}): Promise<{ id: string } | null> {
  const exists = await db
    .select({ id: discussions.id })
    .from(discussions)
    .where(and(eq(discussions.id, args.discussionId), discussionIsVisible()))
    .limit(1);
  if (exists.length === 0) return null;

  const rows = await db
    .insert(discussionReplies)
    .values({
      discussionId: args.discussionId,
      bodyText: args.bodyText,
      createdByUserId: args.userId,
    })
    .returning({ id: discussionReplies.id });
  await db
    .update(discussions)
    .set({ updatedAt: new Date() })
    .where(eq(discussions.id, args.discussionId));
  return { id: rows[0].id };
}

// Edit the original post. Author only: moderators do not edit other people's
// content (the admin path for altering someone else's text is privacy
// redaction, a separate destructive action, per the moderation spec). The
// prior body is preserved in discussion_edits before the row is overwritten,
// both inside one transaction. Title is editable but not history-tracked
// (the edit-history schema only versions the body).
export async function editDiscussion(args: {
  discussionId: string;
  title: string;
  bodyText: string;
  userId: string;
}): Promise<MutationResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        createdByUserId: discussions.createdByUserId,
        bodyText: discussions.bodyText,
        bodyFormat: discussions.bodyFormat,
      })
      .from(discussions)
      .where(eq(discussions.id, args.discussionId))
      .limit(1);
    if (rows.length === 0) return { ok: false, reason: "not_found" } as const;
    const cur = rows[0];
    if (cur.createdByUserId !== args.userId) {
      return { ok: false, reason: "forbidden" } as const;
    }
    await tx.insert(discussionEdits).values({
      discussionId: args.discussionId,
      priorBodyText: cur.bodyText,
      priorBodyFormat: cur.bodyFormat,
      editedByUserId: args.userId,
    });
    await tx
      .update(discussions)
      .set({ title: args.title, bodyText: args.bodyText, updatedAt: new Date() })
      .where(eq(discussions.id, args.discussionId));
    return { ok: true } as const;
  });
}

// Edit a reply. Author only, same as editing the original post.
export async function editReply(args: {
  replyId: string;
  bodyText: string;
  userId: string;
}): Promise<MutationResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        createdByUserId: discussionReplies.createdByUserId,
        bodyText: discussionReplies.bodyText,
        bodyFormat: discussionReplies.bodyFormat,
      })
      .from(discussionReplies)
      .where(eq(discussionReplies.id, args.replyId))
      .limit(1);
    if (rows.length === 0) return { ok: false, reason: "not_found" } as const;
    const cur = rows[0];
    if (cur.createdByUserId !== args.userId) {
      return { ok: false, reason: "forbidden" } as const;
    }
    await tx.insert(discussionReplyEdits).values({
      discussionReplyId: args.replyId,
      priorBodyText: cur.bodyText,
      priorBodyFormat: cur.bodyFormat,
      editedByUserId: args.userId,
    });
    await tx
      .update(discussionReplies)
      .set({ bodyText: args.bodyText, updatedAt: new Date() })
      .where(eq(discussionReplies.id, args.replyId));
    return { ok: true } as const;
  });
}

// Close / resolve / reopen. Allowed for the thread author or a moderator.
export async function setDiscussionStatus(args: {
  discussionId: string;
  status: DiscussionStatus;
  userId: string;
  canModerate: boolean;
}): Promise<MutationResult> {
  const rows = await db
    .select({ createdByUserId: discussions.createdByUserId })
    .from(discussions)
    .where(eq(discussions.id, args.discussionId))
    .limit(1);
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  if (rows[0].createdByUserId !== args.userId && !args.canModerate) {
    return { ok: false, reason: "forbidden" };
  }
  await db
    .update(discussions)
    .set({ status: args.status, updatedAt: new Date() })
    .where(eq(discussions.id, args.discussionId));
  return { ok: true };
}

// Mark / unmark the accepted answer (Q&A). Allowed for the thread author or a
// moderator. `replyId` null clears the answer; otherwise it must be a reply on
// this thread. Doesn't bump updatedAt: marking an answer isn't new content and
// shouldn't reorder the list.
export async function setAnswer(args: {
  discussionId: string;
  replyId: string | null;
  userId: string;
  canModerate: boolean;
}): Promise<MutationResult> {
  const rows = await db
    .select({ createdByUserId: discussions.createdByUserId })
    .from(discussions)
    .where(eq(discussions.id, args.discussionId))
    .limit(1);
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  if (rows[0].createdByUserId !== args.userId && !args.canModerate) {
    return { ok: false, reason: "forbidden" };
  }
  if (args.replyId !== null) {
    const reply = await db
      .select({ id: discussionReplies.id })
      .from(discussionReplies)
      .where(
        and(
          eq(discussionReplies.id, args.replyId),
          eq(discussionReplies.discussionId, args.discussionId),
        ),
      )
      .limit(1);
    if (reply.length === 0) return { ok: false, reason: "not_found" };
  }
  await db
    .update(discussions)
    .set({ answeredReplyId: args.replyId })
    .where(eq(discussions.id, args.discussionId));
  return { ok: true };
}

// Pin / unpin a thread to the top of its doco's list. Moderator only (a doco-
// curation power, not something the author does to their own thread).
export async function setPinned(args: {
  discussionId: string;
  pinned: boolean;
  canModerate: boolean;
}): Promise<MutationResult> {
  if (!args.canModerate) return { ok: false, reason: "forbidden" };
  const rows = await db
    .select({ id: discussions.id })
    .from(discussions)
    .where(eq(discussions.id, args.discussionId))
    .limit(1);
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  await db
    .update(discussions)
    .set({ pinnedAt: args.pinned ? new Date() : null })
    .where(eq(discussions.id, args.discussionId));
  return { ok: true };
}

// Inbox fan-out for a new reply: notify the thread author and everyone who
// replied earlier, minus the actor. Plain-text stored copy (matching the
// claim-notification convention); linkUrl is the raw path, localized at
// render time. Run via waitUntil so it never blocks the write response.
// The thread's participants (the original poster + everyone who replied),
// minus the acting user and minus tombstoned accounts (a deleted user has no
// inbox to notify): the recipient set for thread-level notifications.
async function threadParticipants(
  discussionId: string,
  actorUserId: string,
): Promise<{ title: string; recipients: Set<string> } | null> {
  const dRows = await db
    .select({
      author: discussions.createdByUserId,
      title: discussions.title,
      authorDeletedAt: users.deletedAt,
    })
    .from(discussions)
    .innerJoin(users, eq(users.id, discussions.createdByUserId))
    .where(eq(discussions.id, discussionId))
    .limit(1);
  if (dRows.length === 0) return null;

  const priorAuthors = await db
    .selectDistinct({ u: discussionReplies.createdByUserId })
    .from(discussionReplies)
    .innerJoin(users, eq(users.id, discussionReplies.createdByUserId))
    .where(and(eq(discussionReplies.discussionId, discussionId), isNull(users.deletedAt)));

  const recipients = new Set<string>();
  if (dRows[0].authorDeletedAt === null) recipients.add(dRows[0].author);
  for (const r of priorAuthors) recipients.add(r.u);
  recipients.delete(actorUserId);
  return { title: dRows[0].title, recipients };
}

export async function notifyNewReply(args: {
  discussionId: string;
  threadUrl: string;
  actorUserId: string;
  /** Users already notified about this post another way (e.g. mentioned in
   *  it); the more specific notification wins, never both. */
  excludeUserIds?: ReadonlySet<string>;
}): Promise<void> {
  const thread = await threadParticipants(args.discussionId, args.actorUserId);
  if (thread === null) return;
  for (const id of args.excludeUserIds ?? []) thread.recipients.delete(id);
  if (thread.recipients.size === 0) return;

  const bodyMarkdown = `A new reply was posted in this discussion.

[Open the discussion](${args.threadUrl}){ .md-button .md-button--primary }`;

  await db.insert(inboxMessages).values(
    [...thread.recipients].map((userId) => ({
      userId,
      kind: "discussion_reply" as const,
      subject: `New reply: ${thread.title}`,
      preview: "Someone replied to a discussion you're part of.",
      bodyMarkdown,
      linkUrl: args.threadUrl,
      relatedRecordId: args.discussionId,
    })),
  );
}

// Reader-facing wording per status; "open" arrives via the reopen action.
const STATUS_CHANGE_LABEL: Record<DiscussionStatus, string> = {
  open: "reopened",
  closed: "closed",
  resolved: "marked resolved",
};

/** Notifies the thread's participants that it was closed / resolved / reopened. */
export async function notifyStatusChange(args: {
  discussionId: string;
  status: DiscussionStatus;
  threadUrl: string;
  actorUserId: string;
}): Promise<void> {
  const thread = await threadParticipants(args.discussionId, args.actorUserId);
  if (thread === null || thread.recipients.size === 0) return;

  const label = STATUS_CHANGE_LABEL[args.status];
  const bodyMarkdown = `This discussion was ${label}.

[Open the discussion](${args.threadUrl}){ .md-button .md-button--primary }`;

  await db.insert(inboxMessages).values(
    [...thread.recipients].map((userId) => ({
      userId,
      kind: "discussion_status_changed" as const,
      subject: `Discussion ${label}: ${thread.title}`,
      preview: `A discussion you're part of was ${label}.`,
      bodyMarkdown,
      linkUrl: args.threadUrl,
      relatedRecordId: args.discussionId,
    })),
  );
}

/** Notifies users @mentioned in a new post or reply. Returns the notified
 *  user ids so the thread-level fan-out can skip them (the mention is the
 *  more specific signal). Mentions of the actor or unknown handles no-op. */
export async function notifyMentions(args: {
  discussionId: string;
  bodyText: string;
  threadUrl: string;
  actorUserId: string;
}): Promise<Set<string>> {
  const handles = extractMentionHandles(args.bodyText);
  if (handles.length === 0) return new Set();

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.handle, handles), isNull(users.deletedAt)));
  const mentioned = new Set(userRows.map((r) => r.id));
  mentioned.delete(args.actorUserId);
  if (mentioned.size === 0) return new Set();

  const dRows = await db
    .select({ title: discussions.title })
    .from(discussions)
    .where(eq(discussions.id, args.discussionId))
    .limit(1);
  if (dRows.length === 0) return new Set();

  const bodyMarkdown = `Someone mentioned you in a discussion.

[Open the discussion](${args.threadUrl}){ .md-button .md-button--primary }`;

  await db.insert(inboxMessages).values(
    [...mentioned].map((userId) => ({
      userId,
      kind: "mention" as const,
      subject: `You were mentioned: ${dRows[0].title}`,
      preview: "Someone mentioned you in a discussion.",
      bodyMarkdown,
      linkUrl: args.threadUrl,
      relatedRecordId: args.discussionId,
    })),
  );
  return mentioned;
}
