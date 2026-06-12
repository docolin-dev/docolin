import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getDocoHeader, resolveDocoIdentity, resolveProjectBySlug } from "$lib/server/doco-resolve";
import {
  canModerateDiscussion,
  createReply,
  editDiscussion,
  editReply,
  getDiscussionRef,
  getThread,
  notifyMentions,
  notifyNewReply,
  notifyStatusChange,
  setAnswer,
  setDiscussionStatus,
  setPinned,
  type DiscussionStatus,
} from "$lib/server/discussions";
import { fileDeletionRequest, submitReport } from "$lib/server/moderation";
import { getThreadReactions, toggleReaction } from "$lib/server/reactions";
import { isReactionEmoji } from "$lib/reactions";
import { LIMITS, isRequestBodyTooLarge } from "$lib/limits";
import type { ModerationTargetType } from "$lib/moderation-reasons";
import {
  discussionRef,
  discussionUrls,
  parseDiscussionNumber,
  rebuildPathInSource,
} from "$lib/doco-urls";
import { purgeCacheUrls } from "$lib/sync/cache-purge";
import { localizeHref } from "$paraglide/runtime";

// Single discussion thread, addressed by its per-doco number + title slug
// ("12-cuda-fails-on-fedora-41"). The number is canonical; a stale or missing
// slug 301s to the canonical form so there's one indexable URL per thread.
// Public, server-rendered, edge-cached like the doco viewer; per-user controls
// hydrate client-side. Mutations are form actions, purge-on-write + notify.

const CACHE_LATEST = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const CACHE_DATA_REQUEST = "private, no-store";

function fieldStr(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function parseStatus(raw: string): DiscussionStatus | null {
  if (raw === "open" || raw === "closed" || raw === "resolved") return raw;
  return null;
}

// Moderation targets reachable from a thread page: the original post, a reply,
// or an individual edit-history version of either. Versions are handled on the
// doco viewer, not here.
function parseThreadTargetType(raw: string): ModerationTargetType | null {
  if (
    raw === "discussion" ||
    raw === "discussion_reply" ||
    raw === "discussion_edit" ||
    raw === "discussion_reply_edit"
  ) {
    return raw;
  }
  return null;
}

// Deep-link a target's notification to where it lives in the thread.
function targetUrlFor(
  threadUrl: string,
  targetType: ModerationTargetType,
  targetId: string,
): string {
  return targetType === "discussion_reply" ? `${threadUrl}#comment-${targetId}` : threadUrl;
}

export const load: PageServerLoad = async ({ params, setHeaders, isDataRequest }) => {
  const proj = await resolveProjectBySlug(params.org, params.project);
  if (proj === null) error(404);
  const docoIdRow = await resolveDocoIdentity(
    proj.gitSourceId,
    rebuildPathInSource(params.path, proj.subpath),
  );
  if (docoIdRow === null) error(404);

  const number = parseDiscussionNumber(params.ref);
  if (number === null) error(404);
  const thread = await getThread(docoIdRow.docoId, number);
  if (thread === null) error(404);

  // One canonical, indexable URL per thread: redirect stale / slugless refs.
  const canonical = discussionRef(thread.number, thread.title);
  if (params.ref !== canonical) {
    redirect(
      301,
      localizeHref(`/${params.org}/${params.project}/${params.path}/discussions/${canonical}`),
    );
  }

  setHeaders({ "cache-control": isDataRequest ? CACHE_DATA_REQUEST : CACHE_LATEST });

  const [header, reactions] = await Promise.all([
    getDocoHeader(docoIdRow.latestPublishedVersionId),
    // Counts are public and identical for every reader, so they belong in the
    // cached payload; the toggle action purges these URLs like a reply does.
    getThreadReactions(thread.id),
  ]);

  return {
    org: { slug: proj.orgSlug, displayName: proj.orgDisplayName },
    project: { slug: proj.projectSlug, displayName: proj.projectDisplayName },
    docoPath: params.path,
    docoTitle: header.title ?? params.path,
    kindSegments: header.kindSegments,
    thread,
    reactions,
  };
};

interface ActionContext {
  disc: { id: string; number: number; title: string };
  canModerate: boolean;
  threadUrl: string;
}

// Shared action preamble: resolve project + doco, parse the number from the
// URL ref, load the discussion's identity, and compute moderation rights.
// Returns null on any miss (caller turns it into a 404 fail).
async function actionContext(
  params: { org: string; project: string; path: string; ref: string },
  user: { id: string; isPlatformAdmin: boolean },
): Promise<ActionContext | null> {
  const proj = await resolveProjectBySlug(params.org, params.project);
  if (proj === null) return null;
  const docoIdRow = await resolveDocoIdentity(
    proj.gitSourceId,
    rebuildPathInSource(params.path, proj.subpath),
  );
  if (docoIdRow === null) return null;
  const number = parseDiscussionNumber(params.ref);
  if (number === null) return null;
  const disc = await getDiscussionRef(docoIdRow.docoId, number);
  if (disc === null) return null;
  const canModerate = canModerateDiscussion({
    user,
    ownerOrgAdminUserId: proj.ownerOrgAdminUserId,
  });
  const threadUrl = `/${params.org}/${params.project}/${params.path}/discussions/${discussionRef(disc.number, disc.title)}`;
  return { disc, canModerate, threadUrl };
}

// Purge the thread page and its list (status / title / body changes show up in
// both). Best-effort, fired in the background. Uses the ref built from the
// pre-edit title, which is the URL that was cached.
function purgeThread(
  platform: App.Platform | undefined,
  params: { org: string; project: string; path: string },
  ctx: ActionContext,
): void {
  const ref = discussionRef(ctx.disc.number, ctx.disc.title);
  platform?.context.waitUntil(
    purgeCacheUrls([
      ...discussionUrls({
        orgSlug: params.org,
        projectSlug: params.project,
        pathFromProjectRoot: params.path,
        ref,
      }),
      ...discussionUrls({
        orgSlug: params.org,
        projectSlug: params.project,
        pathFromProjectRoot: params.path,
      }),
    ]),
  );
}

export const actions = {
  reply: async ({ request, params, locals, platform }) => {
    if (!locals.dbUser) {
      const here = `/${params.org}/${params.project}/${params.path}/discussions/${params.ref}`;
      redirect(303, localizeHref(`/signin?returnTo=${encodeURIComponent(here)}`));
    }

    if (isRequestBodyTooLarge(request)) {
      return fail(413, { action: "reply", error: "body_too_long" });
    }

    const form = await request.formData();
    const body = fieldStr(form, "body").trim();
    if (body.length === 0) return fail(400, { action: "reply", error: "reply_required", body });
    if (body.length > LIMITS.discussionBody) {
      return fail(400, { action: "reply", error: "body_too_long", body });
    }

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "reply", error: "generic" });

    const res = await createReply({
      discussionId: ctx.disc.id,
      bodyText: body,
      userId: locals.dbUser.id,
    });
    if (res === null) return fail(404, { action: "reply", error: "generic" });

    const userId = locals.dbUser.id;
    // Deep-link the notification to the new reply.
    const replyUrl = `${ctx.threadUrl}#comment-${res.id}`;
    platform?.context.waitUntil(
      Promise.all([
        // Mentions first: a mentioned participant gets the mention, not both.
        notifyMentions({
          discussionId: ctx.disc.id,
          bodyText: body,
          threadUrl: replyUrl,
          actorUserId: userId,
        }).then((mentioned) =>
          notifyNewReply({
            discussionId: ctx.disc.id,
            threadUrl: replyUrl,
            actorUserId: userId,
            excludeUserIds: mentioned,
          }),
        ),
        purgeCacheUrls([
          ...discussionUrls({
            orgSlug: params.org,
            projectSlug: params.project,
            pathFromProjectRoot: params.path,
            ref: discussionRef(ctx.disc.number, ctx.disc.title),
          }),
          ...discussionUrls({
            orgSlug: params.org,
            projectSlug: params.project,
            pathFromProjectRoot: params.path,
          }),
        ]),
      ]),
    );
    return { action: "reply", ok: true };
  },

  // Toggle one emoji on the original post (no replyId) or a reply. Signed-out
  // clicks land at signin and return to the thread.
  react: async ({ request, params, locals, platform }) => {
    if (!locals.dbUser) {
      const here = `/${params.org}/${params.project}/${params.path}/discussions/${params.ref}`;
      redirect(303, localizeHref(`/signin?returnTo=${encodeURIComponent(here)}`));
    }

    const form = await request.formData();
    const emoji = fieldStr(form, "emoji");
    const rawReplyId = fieldStr(form, "replyId");
    const replyId = rawReplyId.length > 0 ? rawReplyId : null;
    if (!isReactionEmoji(emoji)) return fail(400, { action: "react", error: "generic" });

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "react", error: "generic" });

    const ok = await toggleReaction({
      discussionId: ctx.disc.id,
      replyId,
      emoji,
      userId: locals.dbUser.id,
    });
    if (!ok) return fail(404, { action: "react", error: "generic" });

    // Counts render into the cached thread HTML; purge it like a reply would.
    // The list page doesn't show reactions, so the thread URLs suffice.
    purgeThread(platform, params, ctx);
    return { action: "react", ok: true };
  },

  editDiscussion: async ({ request, params, locals, platform }) => {
    if (!locals.dbUser) return fail(401, { action: "editDiscussion", error: "generic" });
    if (isRequestBodyTooLarge(request)) {
      return fail(413, { action: "editDiscussion", error: "body_too_long" });
    }
    const form = await request.formData();
    const title = fieldStr(form, "title").trim();
    // Body stays optional on edit too, matching create.
    const body = fieldStr(form, "body").trim();
    if (title.length === 0) return fail(400, { action: "editDiscussion", error: "title_required" });
    if (title.length > LIMITS.discussionTitle) {
      return fail(400, { action: "editDiscussion", error: "title_too_long" });
    }
    if (body.length > LIMITS.discussionBody) {
      return fail(400, { action: "editDiscussion", error: "body_too_long" });
    }

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "editDiscussion", error: "generic" });

    const res = await editDiscussion({
      discussionId: ctx.disc.id,
      title,
      bodyText: body,
      userId: locals.dbUser.id,
    });
    if (!res.ok) {
      return fail(res.reason === "forbidden" ? 403 : 404, {
        action: "editDiscussion",
        error: res.reason,
      });
    }
    purgeThread(platform, params, ctx);
    return { action: "editDiscussion", ok: true };
  },

  editReply: async ({ request, params, locals, platform }) => {
    if (!locals.dbUser) return fail(401, { action: "editReply", error: "generic" });
    if (isRequestBodyTooLarge(request)) {
      return fail(413, { action: "editReply", error: "body_too_long" });
    }
    const form = await request.formData();
    const replyId = fieldStr(form, "replyId");
    const body = fieldStr(form, "body").trim();
    if (replyId.length === 0) return fail(400, { action: "editReply", error: "generic" });
    if (body.length === 0) {
      return fail(400, { action: "editReply", error: "reply_required", replyId });
    }
    if (body.length > LIMITS.discussionBody) {
      return fail(400, { action: "editReply", error: "body_too_long", replyId, body });
    }

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "editReply", error: "generic" });

    const res = await editReply({
      replyId,
      bodyText: body,
      userId: locals.dbUser.id,
    });
    if (!res.ok) {
      return fail(res.reason === "forbidden" ? 403 : 404, {
        action: "editReply",
        error: res.reason,
      });
    }
    purgeThread(platform, params, ctx);
    return { action: "editReply", ok: true };
  },

  setStatus: async ({ request, params, locals, platform }) => {
    if (!locals.dbUser) return fail(401, { action: "setStatus", error: "generic" });
    const form = await request.formData();
    const status = parseStatus(fieldStr(form, "status"));
    if (status === null) return fail(400, { action: "setStatus", error: "generic" });

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "setStatus", error: "generic" });

    const res = await setDiscussionStatus({
      discussionId: ctx.disc.id,
      status,
      userId: locals.dbUser.id,
      canModerate: ctx.canModerate,
    });
    if (!res.ok) {
      return fail(res.reason === "forbidden" ? 403 : 404, {
        action: "setStatus",
        error: res.reason,
      });
    }
    platform?.context.waitUntil(
      notifyStatusChange({
        discussionId: ctx.disc.id,
        status,
        threadUrl: ctx.threadUrl,
        actorUserId: locals.dbUser.id,
      }),
    );
    purgeThread(platform, params, ctx);
    return { action: "setStatus", ok: true };
  },

  setAnswer: async ({ request, params, locals, platform }) => {
    if (!locals.dbUser) return fail(401, { action: "setAnswer", error: "generic" });
    const form = await request.formData();
    // Empty replyId clears the accepted answer.
    const rawReplyId = fieldStr(form, "replyId");
    const replyId = rawReplyId.length > 0 ? rawReplyId : null;

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "setAnswer", error: "generic" });

    const res = await setAnswer({
      discussionId: ctx.disc.id,
      replyId,
      userId: locals.dbUser.id,
      canModerate: ctx.canModerate,
    });
    if (!res.ok) {
      return fail(res.reason === "forbidden" ? 403 : 404, {
        action: "setAnswer",
        error: res.reason,
      });
    }
    purgeThread(platform, params, ctx);
    return { action: "setAnswer", ok: true };
  },

  setPinned: async ({ request, params, locals, platform }) => {
    if (!locals.dbUser) return fail(401, { action: "setPinned", error: "generic" });
    const form = await request.formData();
    const pinned = fieldStr(form, "pinned") === "true";

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "setPinned", error: "generic" });

    const res = await setPinned({
      discussionId: ctx.disc.id,
      pinned,
      canModerate: ctx.canModerate,
    });
    if (!res.ok) {
      return fail(res.reason === "forbidden" ? 403 : 404, {
        action: "setPinned",
        error: res.reason,
      });
    }
    purgeThread(platform, params, ctx);
    return { action: "setPinned", ok: true };
  },

  // File a report against a post, reply, or one of their edit-history versions.
  // Logged-in only; doesn't change visible content, so no purge.
  report: async ({ request, params, locals }) => {
    if (!locals.dbUser) return fail(401, { action: "report", error: "generic" });
    const form = await request.formData();
    const targetType = parseThreadTargetType(fieldStr(form, "targetType"));
    const targetId = fieldStr(form, "targetId");
    const reason = fieldStr(form, "reason");
    // Details are context for moderators, not authored content; truncating
    // instead of erroring keeps the report flow friction-free.
    const details = fieldStr(form, "details").trim().slice(0, LIMITS.moderationDetails);
    if (targetType === null || targetId.length === 0) {
      return fail(400, { action: "report", error: "generic" });
    }

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "report", error: "generic" });

    const res = await submitReport({
      targetType,
      targetId,
      reportedByUserId: locals.dbUser.id,
      reason,
      details,
      targetUrl: targetUrlFor(ctx.threadUrl, targetType, targetId),
    });
    if (!res.ok) {
      return fail(res.reason === "invalid_reason" ? 400 : 404, {
        action: "report",
        error: res.reason,
      });
    }
    return { action: "report", ok: true };
  },

  // Author deletes their own content (reason "author_request") or a moderator
  // requests deletion of someone's. Filing hides the target immediately, so
  // purge the thread; if the original post was the target the thread is now
  // hidden, so send the actor back to the list.
  requestDeletion: async ({ request, params, locals, platform }) => {
    if (!locals.dbUser) return fail(401, { action: "requestDeletion", error: "generic" });
    const form = await request.formData();
    const targetType = parseThreadTargetType(fieldStr(form, "targetType"));
    const targetId = fieldStr(form, "targetId");
    const reason = fieldStr(form, "reason");
    // Truncated like report details: moderator context, not authored content.
    const details = fieldStr(form, "details").trim().slice(0, LIMITS.moderationDetails);
    if (targetType === null || targetId.length === 0 || reason.length === 0) {
      return fail(400, { action: "requestDeletion", error: "generic" });
    }

    const ctx = await actionContext(params, locals.dbUser);
    if (ctx === null) return fail(404, { action: "requestDeletion", error: "generic" });

    const res = await fileDeletionRequest({
      targetType,
      targetId,
      reason,
      details,
      user: { id: locals.dbUser.id, isPlatformAdmin: locals.dbUser.isPlatformAdmin },
      targetUrl: targetUrlFor(ctx.threadUrl, targetType, targetId),
    });
    if (!res.ok) {
      return fail(res.reason === "forbidden" ? 403 : res.reason === "invalid_reason" ? 400 : 404, {
        action: "requestDeletion",
        error: res.reason,
      });
    }

    purgeThread(platform, params, ctx);
    // The original post being deleted hides the whole thread; nothing left to
    // show, so return to the doco's discussion list.
    if (res.wasDiscussion) {
      redirect(303, localizeHref(`/${params.org}/${params.project}/${params.path}/discussions`));
    }
    return { action: "requestDeletion", ok: true };
  },
} satisfies Actions;
