import { and, desc, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
  deletionRequests,
  discussionEdits,
  discussionReplies,
  discussionReplyEdits,
  discussions,
  docos,
  gitSources,
  inboxMessages,
  moderationActions,
  orgs,
  projects,
  reports,
  users,
  versions,
} from "$lib/server/db/schema";
import {
  hideContent,
  redactContent,
  unhideContent,
  type ModerationTargetType,
} from "$lib/server/moderation";
import { REASON_SEVERITY_ORDER } from "$lib/moderation-reasons";
import { discussionRef, pathFromSourcePath } from "$lib/doco-urls";

// Review side of moderation: the admin queue's read queries and the actions an
// admin takes (dismiss, hide, redact, approve / deny a deletion request). The
// submission side (filing reports + requests) is in moderation.ts. This surface
// is admin-only and never edge-cached, so it reads originals directly and shows
// hidden content the public can't see.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Public path (no locale prefix; localized in the page) for the doco a target
// belongs to. Null when the doco lost its git source (path can't be rebuilt).
async function docoLocation(
  docoId: string,
): Promise<{ orgSlug: string; projectSlug: string; pathFromProjectRoot: string } | null> {
  const r = await db
    .select({
      orgSlug: orgs.slug,
      projectSlug: projects.slug,
      pathInSource: docos.pathInSource,
      subpath: gitSources.subpath,
    })
    .from(docos)
    .innerJoin(projects, eq(projects.id, docos.projectId))
    .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
    .innerJoin(gitSources, eq(gitSources.id, docos.gitSourceId))
    .where(eq(docos.id, docoId))
    .limit(1);
  if (r.length === 0) return null;
  const row = r[0];
  if (row.pathInSource === null) return null;
  return {
    orgSlug: row.orgSlug,
    projectSlug: row.projectSlug,
    pathFromProjectRoot: pathFromSourcePath(row.pathInSource, row.subpath),
  };
}

export interface TargetView {
  // Original body, shown to the admin (the public read path can't, when hidden).
  // Empty for version targets (the doco body isn't pulled into the queue).
  bodyText: string;
  isRedacted: boolean;
  isHidden: boolean;
  authorUserId: string | null;
  authorHandle: string | null;
  authorDisplayName: string | null;
  // Whether the author's account is tombstoned (deleted). When true, the handle
  // and displayName above are blanked here so a renderer can't leak the retired
  // identity; show "deleted account" instead.
  authorDeleted: boolean;
  // Short human label for the queue row.
  contextLabel: string;
  // Raw path to the content (localized in the page); null if unresolvable.
  url: string | null;
}

// Resolves a moderation target to everything the queue needs to display and
// notify on. Returns null for a missing target.
export async function resolveTargetView(
  targetType: ModerationTargetType,
  targetId: string,
): Promise<TargetView | null> {
  switch (targetType) {
    case "discussion": {
      const r = await db
        .select({
          docoId: discussions.docoId,
          number: discussions.number,
          title: discussions.title,
          bodyText: discussions.bodyText,
          isRedacted: discussions.isRedacted,
          hiddenAt: discussions.hiddenAt,
          author: discussions.createdByUserId,
          handle: users.handle,
          displayName: users.displayName,
          deletedAt: users.deletedAt,
        })
        .from(discussions)
        .innerJoin(users, eq(users.id, discussions.createdByUserId))
        .where(eq(discussions.id, targetId))
        .limit(1);
      if (!r[0]) return null;
      const loc = await docoLocation(r[0].docoId);
      const ref = discussionRef(r[0].number, r[0].title);
      const authorDeleted = r[0].deletedAt !== null;
      return {
        bodyText: r[0].bodyText,
        isRedacted: r[0].isRedacted,
        isHidden: r[0].hiddenAt !== null,
        authorUserId: r[0].author,
        authorHandle: authorDeleted ? "" : r[0].handle,
        authorDisplayName: authorDeleted ? null : r[0].displayName,
        authorDeleted,
        contextLabel: `Discussion #${String(r[0].number)}: ${r[0].title}`,
        url: loc
          ? `/${loc.orgSlug}/${loc.projectSlug}/${loc.pathFromProjectRoot}/discussions/${ref}`
          : null,
      };
    }
    case "discussion_reply": {
      const r = await db
        .select({
          docoId: discussions.docoId,
          number: discussions.number,
          title: discussions.title,
          bodyText: discussionReplies.bodyText,
          isRedacted: discussionReplies.isRedacted,
          hiddenAt: discussionReplies.hiddenAt,
          author: discussionReplies.createdByUserId,
          handle: users.handle,
          displayName: users.displayName,
          deletedAt: users.deletedAt,
        })
        .from(discussionReplies)
        .innerJoin(discussions, eq(discussions.id, discussionReplies.discussionId))
        .innerJoin(users, eq(users.id, discussionReplies.createdByUserId))
        .where(eq(discussionReplies.id, targetId))
        .limit(1);
      if (!r[0]) return null;
      const loc = await docoLocation(r[0].docoId);
      const ref = discussionRef(r[0].number, r[0].title);
      const authorDeleted = r[0].deletedAt !== null;
      return {
        bodyText: r[0].bodyText,
        isRedacted: r[0].isRedacted,
        isHidden: r[0].hiddenAt !== null,
        authorUserId: r[0].author,
        authorHandle: authorDeleted ? "" : r[0].handle,
        authorDisplayName: authorDeleted ? null : r[0].displayName,
        authorDeleted,
        contextLabel: `Reply in #${String(r[0].number)}: ${r[0].title}`,
        url: loc
          ? `/${loc.orgSlug}/${loc.projectSlug}/${loc.pathFromProjectRoot}/discussions/${ref}#comment-${targetId}`
          : null,
      };
    }
    case "version": {
      const r = await db
        .select({
          docoId: versions.docoId,
          title: versions.title,
          author: versions.createdByUserId,
          handle: users.handle,
          displayName: users.displayName,
          deletedAt: users.deletedAt,
        })
        .from(versions)
        .leftJoin(users, eq(users.id, versions.createdByUserId))
        .where(eq(versions.id, targetId))
        .limit(1);
      if (!r[0]) return null;
      const loc = await docoLocation(r[0].docoId);
      const authorDeleted = r[0].deletedAt !== null;
      return {
        bodyText: "",
        isRedacted: false,
        isHidden: false,
        authorUserId: r[0].author,
        authorHandle: authorDeleted ? "" : r[0].handle,
        authorDisplayName: authorDeleted ? null : r[0].displayName,
        authorDeleted,
        contextLabel: `Doco version: ${r[0].title}`,
        url: loc ? `/${loc.orgSlug}/${loc.projectSlug}/${loc.pathFromProjectRoot}` : null,
      };
    }
    case "discussion_edit": {
      const r = await db
        .select({
          docoId: discussions.docoId,
          number: discussions.number,
          title: discussions.title,
          bodyText: discussionEdits.priorBodyText,
          isRedacted: discussionEdits.isRedacted,
          hiddenAt: discussionEdits.hiddenAt,
          author: discussionEdits.editedByUserId,
          handle: users.handle,
          displayName: users.displayName,
          deletedAt: users.deletedAt,
        })
        .from(discussionEdits)
        .innerJoin(discussions, eq(discussions.id, discussionEdits.discussionId))
        .innerJoin(users, eq(users.id, discussionEdits.editedByUserId))
        .where(eq(discussionEdits.id, targetId))
        .limit(1);
      if (!r[0]) return null;
      const loc = await docoLocation(r[0].docoId);
      const ref = discussionRef(r[0].number, r[0].title);
      const authorDeleted = r[0].deletedAt !== null;
      return {
        bodyText: r[0].bodyText,
        isRedacted: r[0].isRedacted,
        isHidden: r[0].hiddenAt !== null,
        authorUserId: r[0].author,
        authorHandle: authorDeleted ? "" : r[0].handle,
        authorDisplayName: authorDeleted ? null : r[0].displayName,
        authorDeleted,
        contextLabel: `Edit-history version of discussion #${String(r[0].number)}`,
        url: loc
          ? `/${loc.orgSlug}/${loc.projectSlug}/${loc.pathFromProjectRoot}/discussions/${ref}`
          : null,
      };
    }
    case "discussion_reply_edit": {
      const r = await db
        .select({
          docoId: discussions.docoId,
          number: discussions.number,
          title: discussions.title,
          replyId: discussionReplyEdits.discussionReplyId,
          bodyText: discussionReplyEdits.priorBodyText,
          isRedacted: discussionReplyEdits.isRedacted,
          hiddenAt: discussionReplyEdits.hiddenAt,
          author: discussionReplyEdits.editedByUserId,
          handle: users.handle,
          displayName: users.displayName,
          deletedAt: users.deletedAt,
        })
        .from(discussionReplyEdits)
        .innerJoin(
          discussionReplies,
          eq(discussionReplies.id, discussionReplyEdits.discussionReplyId),
        )
        .innerJoin(discussions, eq(discussions.id, discussionReplies.discussionId))
        .innerJoin(users, eq(users.id, discussionReplyEdits.editedByUserId))
        .where(eq(discussionReplyEdits.id, targetId))
        .limit(1);
      if (!r[0]) return null;
      const loc = await docoLocation(r[0].docoId);
      const ref = discussionRef(r[0].number, r[0].title);
      const authorDeleted = r[0].deletedAt !== null;
      return {
        bodyText: r[0].bodyText,
        isRedacted: r[0].isRedacted,
        isHidden: r[0].hiddenAt !== null,
        authorUserId: r[0].author,
        authorHandle: authorDeleted ? "" : r[0].handle,
        authorDisplayName: authorDeleted ? null : r[0].displayName,
        authorDeleted,
        contextLabel: `Edit-history version of a reply in #${String(r[0].number)}`,
        url: loc
          ? `/${loc.orgSlug}/${loc.projectSlug}/${loc.pathFromProjectRoot}/discussions/${ref}#comment-${r[0].replyId}`
          : null,
      };
    }
  }
}

export interface QueueReport {
  id: string;
  reason: string;
  details: string | null;
  reporterHandle: string;
  reporterDisplayName: string | null;
  createdAt: string;
}

export interface ReportGroup {
  targetType: ModerationTargetType;
  targetId: string;
  count: number;
  reReportCount: number;
  latestAt: string;
  reports: QueueReport[];
  target: TargetView | null;
}

const QUEUE_LIMIT = 200;

// Open reports, grouped by the target they're against. Groups sort by report
// volume then recency, which is a rough stand-in for the full priority score
// (severity / age / re-report weighting) until that's tuned from real data.
export async function listOpenReports(): Promise<ReportGroup[]> {
  const rows = await db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      details: reports.details,
      reReport: reports.dismissalThenReReportCount,
      createdAt: reports.createdAt,
      reporterHandle: users.handle,
      reporterDisplayName: users.displayName,
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reportedByUserId))
    .where(eq(reports.status, "open"))
    .orderBy(desc(reports.createdAt))
    .limit(QUEUE_LIMIT);

  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    let g = groups.get(key);
    if (g === undefined) {
      g = {
        targetType: r.targetType,
        targetId: r.targetId,
        count: 0,
        reReportCount: r.reReport,
        latestAt: r.createdAt.toISOString(),
        reports: [],
        target: null,
      };
      groups.set(key, g);
    }
    g.count += 1;
    g.reReportCount = Math.max(g.reReportCount, r.reReport);
    g.reports.push({
      id: r.id,
      reason: r.reason,
      details: r.details,
      reporterHandle: r.reporterHandle,
      reporterDisplayName: r.reporterDisplayName,
      createdAt: r.createdAt.toISOString(),
    });
  }

  const list = [...groups.values()];
  for (const g of list) g.target = await resolveTargetView(g.targetType, g.targetId);
  list.sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt));
  return list;
}

export interface QueueDeletionRequest {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  requesterHandle: string;
  requesterDisplayName: string | null;
  createdAt: string;
  target: TargetView | null;
}

// Pending deletion requests, newest first.
export async function listPendingDeletionRequests(): Promise<QueueDeletionRequest[]> {
  const rows = await db
    .select({
      id: deletionRequests.id,
      targetType: deletionRequests.targetType,
      targetId: deletionRequests.targetId,
      reason: deletionRequests.reason,
      details: deletionRequests.details,
      createdAt: deletionRequests.createdAt,
      requesterHandle: users.handle,
      requesterDisplayName: users.displayName,
    })
    .from(deletionRequests)
    .innerJoin(users, eq(users.id, deletionRequests.requestedByUserId))
    .where(eq(deletionRequests.status, "pending"))
    .orderBy(desc(deletionRequests.createdAt))
    .limit(QUEUE_LIMIT);

  const out: QueueDeletionRequest[] = [];
  for (const r of rows) {
    out.push({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      details: r.details,
      requesterHandle: r.requesterHandle,
      requesterDisplayName: r.requesterDisplayName,
      createdAt: r.createdAt.toISOString(),
      target: await resolveTargetView(r.targetType, r.targetId),
    });
  }
  return out;
}

export interface ActionLogItem {
  id: string;
  actionType: string;
  targetType: ModerationTargetType;
  targetId: string;
  reason: string | null;
  notes: string | null;
  actorHandle: string | null;
  createdAt: string;
  target: TargetView | null;
}

// Recent moderation actions, newest first: the audit trail of what was already
// done (dismissed, hidden, redacted, approved, denied), so an admin can revisit
// a resolved item. Target views are resolved once per distinct target.
export async function listRecentActions(): Promise<ActionLogItem[]> {
  const rows = await db
    .select({
      id: moderationActions.id,
      actionType: moderationActions.actionType,
      targetType: moderationActions.targetType,
      targetId: moderationActions.targetId,
      reason: moderationActions.reason,
      notes: moderationActions.notes,
      createdAt: moderationActions.createdAt,
      actorHandle: users.handle,
    })
    .from(moderationActions)
    .leftJoin(users, eq(users.id, moderationActions.actorUserId))
    .orderBy(desc(moderationActions.createdAt))
    .limit(QUEUE_LIMIT);

  const viewCache = new Map<string, TargetView | null>();
  const out: ActionLogItem[] = [];
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    if (!viewCache.has(key)) viewCache.set(key, await resolveTargetView(r.targetType, r.targetId));
    out.push({
      id: r.id,
      actionType: r.actionType,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      notes: r.notes,
      actorHandle: r.actorHandle,
      createdAt: r.createdAt.toISOString(),
      target: viewCache.get(key) ?? null,
    });
  }
  return out;
}

function notificationBody(text: string, url: string | null): string {
  if (url === null) return text;
  return `${text}

[Open it](${url}){ .md-button .md-button--primary }`;
}

// Closes out every open report on a target and tells each distinct reporter the
// outcome. The reports' status becomes "dismissed" (the closed-out state); the
// real action taken, if any, is recorded separately in moderation_actions, so
// "actioned" vs "no action" is reconstructable for stats despite the shared
// status value.
async function resolveTargetReports(
  tx: Tx,
  targetType: ModerationTargetType,
  targetId: string,
  actorUserId: string,
  outcome: "no_action" | "hidden" | "redacted",
  notes: string,
  url: string | null,
): Promise<void> {
  const closed = await tx
    .update(reports)
    .set({
      status: "dismissed",
      resolvedByUserId: actorUserId,
      resolvedAt: new Date(),
      resolutionNotes: notes.length > 0 ? notes : outcome,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reports.targetType, targetType),
        eq(reports.targetId, targetId),
        eq(reports.status, "open"),
      ),
    )
    .returning({ reporter: reports.reportedByUserId });

  const reporters = [...new Set(closed.map((c) => c.reporter))];
  if (reporters.length === 0) return;

  const text =
    outcome === "no_action"
      ? "We reviewed a report you filed and decided no action was needed. Thanks for helping keep docolin healthy."
      : "We reviewed a report you filed and took action on the content. Thanks for flagging it.";
  await tx.insert(inboxMessages).values(
    reporters.map((userId) => ({
      userId,
      kind: "report_resolved" as const,
      subject: "Your report was reviewed",
      preview: outcome === "no_action" ? "No action was needed this time." : "Action was taken.",
      bodyMarkdown: notificationBody(text, url),
      linkUrl: url,
      relatedRecordId: targetId,
    })),
  );
}

export type AdminActionResult = { ok: true } | { ok: false; reason: "not_found" | "unsupported" };

// The reason recorded for an admin action is the most severe reason the target
// was reported for, so the admin never re-picks what reporters already said.
// Falls back to "other" (e.g. a direct hide on something with no open reports).
async function mostSevereOpenReason(
  targetType: ModerationTargetType,
  targetId: string,
): Promise<string> {
  const rows = await db
    .select({ reason: reports.reason })
    .from(reports)
    .where(
      and(
        eq(reports.targetType, targetType),
        eq(reports.targetId, targetId),
        eq(reports.status, "open"),
      ),
    );
  const present = new Set(rows.map((r) => r.reason));
  for (const r of REASON_SEVERITY_ORDER) {
    if (present.has(r)) return r;
  }
  return "other";
}

// Dismiss all open reports on a target with no content action.
export async function dismissReports(args: {
  targetType: ModerationTargetType;
  targetId: string;
  actorUserId: string;
  notes: string;
}): Promise<AdminActionResult> {
  const view = await resolveTargetView(args.targetType, args.targetId);
  if (view === null) return { ok: false, reason: "not_found" };
  await db.transaction(async (tx) => {
    await tx.insert(moderationActions).values({
      actorUserId: args.actorUserId,
      actionType: "dismissed_report",
      targetType: args.targetType,
      targetId: args.targetId,
      notes: args.notes.length > 0 ? args.notes : null,
    });
    await resolveTargetReports(
      tx,
      args.targetType,
      args.targetId,
      args.actorUserId,
      "no_action",
      args.notes,
      view.url,
    );
  });
  return { ok: true };
}

// Hide a target (admin-direct, e.g. acting on reports) and close out its
// reports. Versions have no hide path yet.
export async function adminHide(args: {
  targetType: ModerationTargetType;
  targetId: string;
  actorUserId: string;
  notes: string;
}): Promise<AdminActionResult> {
  if (args.targetType === "version") return { ok: false, reason: "unsupported" };
  const view = await resolveTargetView(args.targetType, args.targetId);
  if (view === null) return { ok: false, reason: "not_found" };
  const reason = await mostSevereOpenReason(args.targetType, args.targetId);
  await db.transaction(async (tx) => {
    await hideContent(tx, args.targetType, args.targetId, args.actorUserId, reason);
    await tx.insert(moderationActions).values({
      actorUserId: args.actorUserId,
      actionType: "hidden",
      targetType: args.targetType,
      targetId: args.targetId,
      reason,
      notes: args.notes.length > 0 ? args.notes : null,
    });
    if (view.authorUserId !== null) {
      await tx.insert(inboxMessages).values({
        userId: view.authorUserId,
        kind: "content_hidden",
        subject: "Your content was hidden",
        preview: "It's no longer visible to other readers.",
        bodyMarkdown: notificationBody(
          "Some of your content was hidden by platform staff because it broke our content policy. It's no longer visible to other readers. Reach out to support if you'd like to address the issue.",
          view.url,
        ),
        linkUrl: view.url,
        relatedRecordId: args.targetId,
      });
    }
    await resolveTargetReports(
      tx,
      args.targetType,
      args.targetId,
      args.actorUserId,
      "hidden",
      args.notes,
      view.url,
    );
  });
  return { ok: true };
}

// Reverse a hide (the hide was a mistake, or the report didn't warrant it). The
// content reappears and the target's reports are closed out as no-action.
export async function adminUnhide(args: {
  targetType: ModerationTargetType;
  targetId: string;
  actorUserId: string;
  notes: string;
}): Promise<AdminActionResult> {
  if (args.targetType === "version") return { ok: false, reason: "unsupported" };
  const view = await resolveTargetView(args.targetType, args.targetId);
  if (view === null) return { ok: false, reason: "not_found" };
  await db.transaction(async (tx) => {
    await unhideContent(tx, args.targetType, args.targetId);
    await tx.insert(moderationActions).values({
      actorUserId: args.actorUserId,
      actionType: "unhidden",
      targetType: args.targetType,
      targetId: args.targetId,
      notes: args.notes.length > 0 ? args.notes : null,
    });
    if (view.authorUserId !== null) {
      await tx.insert(inboxMessages).values({
        userId: view.authorUserId,
        kind: "content_unhidden",
        subject: "Your content is visible again",
        preview: "A hide on your content was reversed.",
        bodyMarkdown: notificationBody(
          "A hide on some of your content was reversed, so it's visible to readers again.",
          view.url,
        ),
        linkUrl: view.url,
        relatedRecordId: args.targetId,
      });
    }
    await resolveTargetReports(
      tx,
      args.targetType,
      args.targetId,
      args.actorUserId,
      "no_action",
      args.notes,
      view.url,
    );
  });
  return { ok: true };
}

// Privacy redaction: destroy the original and close out reports. Irreversible.
export async function adminRedact(args: {
  targetType: ModerationTargetType;
  targetId: string;
  actorUserId: string;
  // The admin-edited replacement body (offending part scrubbed, rest preserved).
  newBody: string;
  notes: string;
}): Promise<AdminActionResult> {
  if (args.targetType === "version") return { ok: false, reason: "unsupported" };
  const view = await resolveTargetView(args.targetType, args.targetId);
  if (view === null) return { ok: false, reason: "not_found" };
  const reason = await mostSevereOpenReason(args.targetType, args.targetId);
  await db.transaction(async (tx) => {
    await redactContent(tx, args.targetType, args.targetId, args.actorUserId, reason, args.newBody);
    // No original content in the audit row, by policy.
    await tx.insert(moderationActions).values({
      actorUserId: args.actorUserId,
      actionType: "redacted",
      targetType: args.targetType,
      targetId: args.targetId,
      reason,
      notes: args.notes.length > 0 ? args.notes : null,
    });
    if (view.authorUserId !== null) {
      await tx.insert(inboxMessages).values({
        userId: view.authorUserId,
        kind: "content_redacted",
        subject: "Your content was edited by platform staff",
        preview: "Part of it was edited out; the edited version stays visible.",
        bodyMarkdown: notificationBody(
          "Platform staff edited some of your content to remove a part that broke our content policy. The edited version stays visible to readers, and the original is no longer stored.",
          view.url,
        ),
        linkUrl: view.url,
        relatedRecordId: args.targetId,
      });
    }
    await resolveTargetReports(
      tx,
      args.targetType,
      args.targetId,
      args.actorUserId,
      "redacted",
      args.notes,
      view.url,
    );
  });
  return { ok: true };
}

// Approve a deletion request: the content stays hidden (filing already hid it).
export async function approveDeletion(args: {
  requestId: string;
  actorUserId: string;
  notes: string;
}): Promise<AdminActionResult> {
  const req = await loadPendingRequest(args.requestId);
  if (req === null) return { ok: false, reason: "not_found" };
  const view = await resolveTargetView(req.targetType, req.targetId);
  await db.transaction(async (tx) => {
    await resolveRequest(tx, args.requestId, "approved", args.actorUserId, args.notes);
    await tx.insert(moderationActions).values({
      actorUserId: args.actorUserId,
      actionType: "approved_deletion",
      targetType: req.targetType,
      targetId: req.targetId,
      relatedRequestId: args.requestId,
      reason: req.reason,
      notes: args.notes.length > 0 ? args.notes : null,
    });
    await tx.insert(inboxMessages).values({
      userId: req.requestedByUserId,
      kind: "deletion_approved",
      subject: "Your deletion request was approved",
      preview: "The content stays removed.",
      bodyMarkdown: notificationBody(
        "Your deletion request was approved. The content stays removed from public view.",
        view?.url ?? null,
      ),
      linkUrl: view?.url ?? null,
      relatedRecordId: args.requestId,
    });
  });
  return { ok: true };
}

// Deny a deletion request: reverse the hide that filing put in place.
export async function denyDeletion(args: {
  requestId: string;
  actorUserId: string;
  notes: string;
}): Promise<AdminActionResult> {
  const req = await loadPendingRequest(args.requestId);
  if (req === null) return { ok: false, reason: "not_found" };
  const view = await resolveTargetView(req.targetType, req.targetId);
  await db.transaction(async (tx) => {
    await resolveRequest(tx, args.requestId, "denied", args.actorUserId, args.notes);
    await unhideContent(tx, req.targetType, req.targetId);
    await tx.insert(moderationActions).values({
      actorUserId: args.actorUserId,
      actionType: "denied_deletion",
      targetType: req.targetType,
      targetId: req.targetId,
      relatedRequestId: args.requestId,
      reason: req.reason,
      notes: args.notes.length > 0 ? args.notes : null,
    });
    await tx.insert(inboxMessages).values({
      userId: req.requestedByUserId,
      kind: "deletion_denied",
      subject: "Your deletion request was denied",
      preview: "The content is visible again.",
      bodyMarkdown: notificationBody(
        "Your deletion request was denied, so the content is visible again." +
          (args.notes.length > 0 ? `\n\nReviewer note: ${args.notes}` : ""),
        view?.url ?? null,
      ),
      linkUrl: view?.url ?? null,
      relatedRecordId: args.requestId,
    });
  });
  return { ok: true };
}

interface PendingRequest {
  targetType: ModerationTargetType;
  targetId: string;
  reason: string;
  requestedByUserId: string;
}

async function loadPendingRequest(requestId: string): Promise<PendingRequest | null> {
  const r = await db
    .select({
      targetType: deletionRequests.targetType,
      targetId: deletionRequests.targetId,
      reason: deletionRequests.reason,
      requestedByUserId: deletionRequests.requestedByUserId,
      status: deletionRequests.status,
    })
    .from(deletionRequests)
    .where(eq(deletionRequests.id, requestId))
    .limit(1);
  if (r.length === 0) return null;
  const row = r[0];
  if (row.status !== "pending") return null;
  return {
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    requestedByUserId: row.requestedByUserId,
  };
}

async function resolveRequest(
  tx: Tx,
  requestId: string,
  status: "approved" | "denied",
  actorUserId: string,
  notes: string,
): Promise<void> {
  await tx
    .update(deletionRequests)
    .set({
      status,
      resolvedByUserId: actorUserId,
      resolvedAt: new Date(),
      resolutionNotes: notes.length > 0 ? notes : null,
      updatedAt: new Date(),
    })
    .where(eq(deletionRequests.id, requestId));
}
