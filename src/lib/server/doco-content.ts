import { and, desc, eq, like } from "drizzle-orm";
import { stringify as stringifyYaml } from "yaml";
import { db } from "$lib/server/db";
import { docos as docosTable, versions } from "$lib/server/db/schema";
import { fromLtree } from "$lib/server/db/schema/types";
import { resolveProjectBySlug, resolveDocoIdentity, getDocoHeader } from "$lib/server/doco-resolve";
import { resolveAuthors, type ResolvedAuthor } from "$lib/server/authors";
import {
  getThread,
  listThreads,
  getDiscussionEditHistory,
  getReplyEditHistory,
  type ThreadDetail,
  type ThreadPost,
  type ThreadReply,
  type ThreadFilter,
  type EditVersion,
} from "$lib/server/discussions";
import {
  discussionRef,
  parseDiscussionNumber,
  parseVersionRef,
  pathFromSourcePath,
  rebuildPathInSource,
} from "$lib/doco-urls";
import { SITE_URL } from "$lib/site";
import { forgeSourceUrl } from "$lib/git/edit-url";

// Resolves a doco's full content by its public URL parts, returning the canonical
// markdown body plus the metadata needed for attribution. Shared by the raw
// markdown routes and the MCP fetch tool, so both serve the same bytes and the
// same citation. Returns null for a missing project / doco / version.

const SHORT_SHA_LENGTH = 7;

export interface DocoVersionSummary {
  number: number;
  commitSha: string | null;
  publishedAt: Date | string;
  pango: number | null;
  isLatest: boolean;
}

export interface DocoContent {
  orgSlug: string;
  projectSlug: string;
  pathFromProjectRoot: string;
  docoId: string;
  versionId: string;
  versionNumber: number;
  commitSha: string | null;
  versionTag: string | null;
  /** True when the request was for the latest version (no @-suffix). */
  isLatestRequest: boolean;
  /** True when the source file was removed from the repo (content still valid). */
  removedFromSource: boolean;
  title: string;
  description: string | null;
  /** Display kind path, e.g. `hardware/gpu/nvidia`. */
  kindPath: string;
  type: string;
  status: string;
  language: string;
  appliesTo: string[];
  difficulty: string | null;
  timeEstimateMinMinutes: number | null;
  timeEstimateMaxMinutes: number | null;
  aliases: string[];
  references: string[];
  prevLink: string | null;
  nextLink: string | null;
  supersededBy: string | null;
  bodyText: string;
  /** The doco's original frontmatter, as authored, replayed in the raw output. It is
   *  the parsed fields re-serialized, so not byte-exact YAML (comments / quoting / key
   *  order are not kept); the byte-exact file is the source commit. Empty for versions
   *  synced before capture; the builder then falls back to title/description. */
  frontmatterExtra: Record<string, unknown>;
  /** Forge URL of the source file pinned to this version's commit: the byte-exact
   *  original, so "the original lives upstream" travels with the bytes. */
  sourceFileUrl: string;
  authors: ResolvedAuthor[];
  pangoScore: number | null;
  verifiedCount: number;
  lastConfirmedAt: Date | string | null;
  publishedAt: Date | string;
  /** True when this is the latest published version of its doco. */
  isLatest: boolean;
  /** Full version history, newest first, so a raw reader can find an older fit. */
  versions: DocoVersionSummary[];
  /** Visible discussion counts, so a raw reader knows community fixes exist. */
  discussions: { total: number; answered: number };
}

export async function getDocoContent(
  orgSlug: string,
  projectSlug: string,
  pathWithRef: string,
): Promise<DocoContent | null> {
  const proj = await resolveProjectBySlug(orgSlug, projectSlug);
  if (proj === null) return null;

  const { pathPart, versionRef } = parseVersionRef(pathWithRef);
  const expectedPathInSource = rebuildPathInSource(pathPart, proj.subpath);
  const docoIdRow = await resolveDocoIdentity(proj.gitSourceId, expectedPathInSource);
  if (docoIdRow === null) return null;
  if (versionRef === null && docoIdRow.latestPublishedVersionId === null) return null;

  const versionFilter =
    versionRef === null
      ? eq(versions.id, docoIdRow.latestPublishedVersionId ?? "")
      : versionRef.kind === "number"
        ? eq(versions.versionNumber, versionRef.value)
        : versionRef.kind === "sha"
          ? like(versions.commitSha, `${versionRef.value}%`)
          : eq(versions.versionTag, versionRef.value);

  // Limit 2 detects an ambiguous short SHA prefix (resolve as not-found rather
  // than silently pick one), mirroring the viewer.
  const rows = await db
    .select({
      pathInSource: docosTable.pathInSource,
      deletedAt: docosTable.deletedAt,
      versionId: versions.id,
      versionNumber: versions.versionNumber,
      commitSha: versions.commitSha,
      versionTag: versions.versionTag,
      title: versions.title,
      description: versions.description,
      kind: versions.kind,
      type: versions.type,
      status: versions.status,
      language: versions.language,
      appliesTo: versions.appliesTo,
      difficulty: versions.difficulty,
      timeEstimateMinMinutes: versions.timeEstimateMinMinutes,
      timeEstimateMaxMinutes: versions.timeEstimateMaxMinutes,
      aliases: versions.aliases,
      references: versions.references,
      prevLink: versions.prevLink,
      nextLink: versions.nextLink,
      supersededBy: versions.supersededBy,
      bodyText: versions.bodyText,
      frontmatterExtra: versions.frontmatterExtra,
      authors: versions.authors,
      verifiedCount: versions.verificationStampCount,
      pangoScore: versions.verificationScore,
      lastConfirmedAt: versions.verificationLastConfirmedAt,
      publishedAt: versions.publishedAt,
      isLatest: versions.isLatest,
    })
    .from(versions)
    .innerJoin(docosTable, eq(docosTable.id, versions.docoId))
    .where(and(eq(versions.docoId, docoIdRow.docoId), versionFilter))
    .orderBy(desc(versions.versionNumber))
    .limit(2);
  if (rows.length !== 1) return null;
  const v = rows[0];

  const authors = await resolveAuthors(v.authors);
  const pathFromProjectRoot = pathFromSourcePath(
    v.pathInSource ?? expectedPathInSource,
    proj.subpath,
  );
  // The source file on the forge, pinned to this version's commit (falls back to
  // the default branch on the rare version with no recorded SHA). Mirrors the
  // viewer's "view source" button, so the pointer travels with copy / raw / MCP.
  const sourceFileUrl = forgeSourceUrl(
    proj.repoUrl,
    v.commitSha !== null ? { commit: v.commitSha } : { branch: proj.defaultBranch },
    v.pathInSource ?? expectedPathInSource,
  );

  // Self-describing extras for the raw / MCP markdown: full version history and
  // visible discussion counts. Parallel, since neither depends on the other.
  const [versionList, threads] = await Promise.all([
    db
      .select({
        number: versions.versionNumber,
        commitSha: versions.commitSha,
        publishedAt: versions.publishedAt,
        pango: versions.verificationScore,
        isLatest: versions.isLatest,
      })
      .from(versions)
      .where(eq(versions.docoId, docoIdRow.docoId))
      .orderBy(desc(versions.versionNumber)),
    listThreads(docoIdRow.docoId, "all"),
  ]);

  return {
    orgSlug: proj.orgSlug,
    projectSlug: proj.projectSlug,
    pathFromProjectRoot,
    docoId: docoIdRow.docoId,
    versionId: v.versionId,
    versionNumber: v.versionNumber,
    commitSha: v.commitSha,
    versionTag: v.versionTag,
    isLatestRequest: versionRef === null,
    removedFromSource: v.deletedAt !== null,
    title: v.title,
    description: v.description,
    kindPath: fromLtree(v.kind),
    type: v.type,
    status: v.status,
    language: v.language,
    appliesTo: v.appliesTo,
    difficulty: v.difficulty,
    timeEstimateMinMinutes: v.timeEstimateMinMinutes,
    timeEstimateMaxMinutes: v.timeEstimateMaxMinutes,
    aliases: v.aliases,
    references: v.references,
    prevLink: v.prevLink,
    nextLink: v.nextLink,
    supersededBy: v.supersededBy,
    bodyText: v.bodyText,
    frontmatterExtra: v.frontmatterExtra,
    sourceFileUrl,
    authors,
    pangoScore: v.pangoScore,
    verifiedCount: v.verifiedCount,
    lastConfirmedAt: v.lastConfirmedAt,
    publishedAt: v.publishedAt,
    isLatest: v.isLatest,
    versions: versionList,
    discussions: {
      total: threads.length,
      answered: threads.filter((t) => t.isAnswered).length,
    },
  };
}

/** Short, immutable ref for a non-latest version's URL (prefer the SHA). */
export function versionSuffix(content: Pick<DocoContent, "commitSha" | "versionNumber">): string {
  return content.commitSha !== null && content.commitSha.length > 0
    ? content.commitSha.slice(0, SHORT_SHA_LENGTH)
    : String(content.versionNumber);
}

/** Canonical doco URL path (with @-suffix only when a specific version was asked). */
export function docoUrlPath(content: DocoContent): string {
  const base = `/${content.orgSlug}/${content.projectSlug}/${content.pathFromProjectRoot}`;
  return content.isLatestRequest ? base : `${base}@${versionSuffix(content)}`;
}

// Authored-frontmatter author entry, reconstructed from the resolved author:
// docolin users keep their handle, external authors their name/url. Mirrors the
// frontmatter `authors` shape so the raw doco round-trips toward its source. A
// tombstoned account is emitted as a deleted marker, never its retired handle.
function frontmatterAuthor(a: ResolvedAuthor): Record<string, unknown> {
  if (a.kind === "user") return a.deleted ? { deleted: true } : { handle: a.handle };
  const out: Record<string, unknown> = { name: a.name };
  if (a.username !== null) out.username = a.username;
  if (a.url !== null) out.url = a.url;
  return out;
}

// Reconstructs the time_estimate string ("5m", "1h", "1h30m", or a "min-max"
// range) from the stored minute bounds.
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${String(mins)}m`;
  if (mins === 0) return `${String(hours)}h`;
  return `${String(hours)}h${String(mins)}m`;
}

// Date-only (YYYY-MM-DD) rendering for the live block; the driver hands back a
// Date or an ISO string depending on the path, so handle both.
function isoDate(value: Date | string): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

// Reconstructs the doco's frontmatter in two clearly-separated layers: the
// author's original frontmatter, as authored, replayed at the top level (title,
// description, their own `docolin:` block, any custom keys), then a single
// `docolin_generated` key holding everything docolin resolves or computes, the
// resolved classification, the upstream source pointer, live verification,
// version history, and discussion pointer, so a reader can tell exactly what the
// author wrote apart from what docolin added. `authors` is overridden with the
// resolved (deleted-account-safe) list. URLs use baseUrl (the serving origin) so
// dev links resolve and production links are canonical. A re-ingest reads the
// author's fields and ignores `docolin_generated`.
function buildFrontmatter(content: DocoContent, baseUrl: string): Record<string, unknown> {
  const generated: Record<string, unknown> = {
    kind: content.kindPath,
    type: content.type,
  };
  if (content.appliesTo.length > 0) generated.applies_to = content.appliesTo;
  generated.language = content.language;
  if (content.difficulty !== null) generated.difficulty = content.difficulty;
  if (content.timeEstimateMinMinutes !== null) {
    const min = content.timeEstimateMinMinutes;
    const max = content.timeEstimateMaxMinutes ?? min;
    generated.time_estimate =
      min === max ? formatDuration(min) : `${formatDuration(min)}-${formatDuration(max)}`;
  }
  generated.status = content.status;
  if (content.supersededBy !== null) generated.superseded_by = content.supersededBy;
  if (content.aliases.length > 0) generated.aliases = content.aliases;
  if (content.references.length > 0) generated.references = content.references;
  if (content.prevLink !== null) generated.prev = content.prevLink;
  if (content.nextLink !== null) generated.next = content.nextLink;

  // The upstream original, pinned to this version's commit: commit first, then url.
  const source: Record<string, unknown> = {};
  if (content.commitSha !== null) source.commit = content.commitSha;
  source.url = content.sourceFileUrl;
  generated.source = source;

  const base = `/${content.orgSlug}/${content.projectSlug}/${content.pathFromProjectRoot}`;
  generated.url = `${baseUrl}${docoUrlPath(content)}`;
  const verification: Record<string, unknown> = {
    pango: content.pangoScore,
    stamps: content.verifiedCount,
  };
  if (content.lastConfirmedAt !== null) {
    verification.last_confirmed = isoDate(content.lastConfirmedAt);
  }
  generated.verification = verification;
  generated.version = {
    number: content.versionNumber,
    published_at: isoDate(content.publishedAt),
    is_latest: content.isLatest,
  };
  generated.versions = content.versions.map((ver) => ({
    number: ver.number,
    published_at: isoDate(ver.publishedAt),
    pango: ver.pango,
    url: ver.isLatest
      ? `${baseUrl}${base}`
      : `${baseUrl}${base}@${versionSuffix({ commitSha: ver.commitSha, versionNumber: ver.number })}`,
  }));
  generated.discussions = {
    total: content.discussions.total,
    answered: content.discussions.answered,
    url: `${baseUrl}${base}/discussions`,
  };

  // Replay the author's original frontmatter as authored (parsed fields, not byte-
  // exact YAML; the byte-exact file is the source commit). A version synced before
  // capture has an empty object, so fall back to the reconstructed title /
  // description. Override `authors` with the resolved list (a retired handle never
  // leaks) and always overwrite `docolin_generated` so an author-written key of
  // that name can't spoof docolin's block.
  const original: Record<string, unknown> = { ...content.frontmatterExtra };
  if (Object.keys(original).length === 0) {
    original.title = content.title;
    if (content.description !== null) original.description = content.description;
  }
  original.authors = content.authors.map(frontmatterAuthor);
  original.docolin_generated = generated;
  return original;
}

/**
 * Renders a doco as standalone markdown: the reconstructed YAML frontmatter
 * (authored fields + docolin's signals under `docolin:`) followed by the body.
 * Self-contained, so wherever it's pasted or fetched the metadata and citation
 * travel with it.
 */
export function buildDocoMarkdown(content: DocoContent, baseUrl: string): string {
  const frontmatter = stringifyYaml(buildFrontmatter(content, baseUrl)).trimEnd();
  return `---\n${frontmatter}\n---\n\n${content.bodyText}\n`;
}

// ── Discussions ─────────────────────────────────────────────────────────────

function postAuthor(post: {
  authorHandle: string;
  authorDisplayName: string | null;
  authorDeleted: boolean;
}): string {
  if (post.authorDeleted) return "deleted account";
  return post.authorDisplayName !== null
    ? `${post.authorDisplayName} (@${post.authorHandle})`
    : `@${post.authorHandle}`;
}

function authorEntry(post: {
  authorHandle: string;
  authorDisplayName: string | null;
  authorDeleted: boolean;
}): Record<string, unknown> {
  if (post.authorDeleted) return { deleted: true };
  return post.authorDisplayName !== null
    ? { name: post.authorDisplayName, handle: post.authorHandle }
    : { handle: post.authorHandle };
}

// `--- label ---` bounds each post, so a body's own markdown (headings,
// thematic breaks) renders verbatim without colliding with the thread structure.
// The triple-hyphen is the markdown delimiter, not prose punctuation; separators
// use `·`, never an em dash (CLAUDE.md).
function postDelimiter(label: string, post: ThreadPost): string {
  const when = post.createdAt.slice(0, 10);
  const edited = post.isEdited ? " (edited)" : "";
  return `--- ${label} · ${postAuthor(post)} · ${when}${edited} ---`;
}

function replyLabel(reply: ThreadReply): string {
  const marks = [reply.isAnswer ? "accepted answer" : "", reply.isOpAuthor ? "author" : ""]
    .filter((m) => m.length > 0)
    .join(", ");
  return marks.length > 0 ? `Reply (${marks})` : "Reply";
}

function appendEdits(parts: string[], edits: EditVersion[]): void {
  for (const edit of edits) {
    const when = edit.editedAt.slice(0, 16).replace("T", " ");
    // The leading arrow marks the edit as nested under the post above without
    // indenting the body (4-space indent would turn it into a code block).
    parts.push(
      `--- ↳ Edit · ${when} ---`,
      edit.removed ? "_This earlier version was removed._" : edit.bodySource,
    );
  }
}

interface DiscussionRender {
  thread: ThreadDetail;
  url: string;
  /** Canonical path of the guide the thread is attached to. */
  docoPath: string;
  opEdits: EditVersion[];
  replyEdits: Map<string, EditVersion[]>;
}

function buildDiscussionFrontmatter(r: DiscussionRender): Record<string, unknown> {
  const { thread } = r;
  const visibleReplies = thread.replies.filter((reply) => !reply.removed);
  const participants: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const post of [thread.op, ...visibleReplies]) {
    if (seen.has(post.authorHandle)) continue;
    seen.add(post.authorHandle);
    participants.push(authorEntry(post));
  }
  const fm: Record<string, unknown> = {
    number: thread.number,
    title: thread.title,
    status: thread.status,
    answered: thread.answeredReplyId !== null,
  };
  if (thread.isPinned) fm.pinned = true;
  fm.source = r.url;
  fm.doco = r.docoPath;
  fm.author = authorEntry(thread.op);
  fm.created_at = thread.op.createdAt;
  fm.reply_count = visibleReplies.length;
  fm.participants = participants;
  return fm;
}

/** Renders a discussion thread to standalone markdown: frontmatter with the
 * thread's metadata, then each post bounded by `--- label ---` delimiters (so
 * bodies render verbatim), with each post's prior edited versions inline. */
export function buildDiscussionMarkdown(r: DiscussionRender): string {
  const frontmatter = stringifyYaml(buildDiscussionFrontmatter(r)).trimEnd();
  const parts: string[] = [
    `---\n${frontmatter}\n---`,
    `# Discussion #${String(r.thread.number)}: ${r.thread.title}`,
    postDelimiter("Original post", r.thread.op),
    r.thread.op.bodySource,
  ];
  appendEdits(parts, r.opEdits);
  for (const reply of r.thread.replies) {
    if (reply.removed) {
      parts.push("--- Reply (removed) ---", "_This reply was removed._");
      continue;
    }
    parts.push(postDelimiter(replyLabel(reply), reply), reply.bodySource);
    appendEdits(parts, r.replyEdits.get(reply.id) ?? []);
  }
  return `${parts.join("\n\n")}\n`;
}

export interface DiscussionMarkdownOptions {
  /** Include each post's prior edited versions inline (default true). */
  includeEdits?: boolean;
}

/** Resolves a discussion by its public URL parts to standalone markdown, or null. */
export async function getDiscussionMarkdown(
  orgSlug: string,
  projectSlug: string,
  docoPath: string,
  ref: string,
  options: DiscussionMarkdownOptions = {},
): Promise<string | null> {
  const proj = await resolveProjectBySlug(orgSlug, projectSlug);
  if (proj === null) return null;
  const number = parseDiscussionNumber(ref);
  if (number === null) return null;

  const expectedPathInSource = rebuildPathInSource(docoPath, proj.subpath);
  const docoIdRow = await resolveDocoIdentity(proj.gitSourceId, expectedPathInSource);
  if (docoIdRow === null) return null;

  const thread = await getThread(docoIdRow.docoId, number);
  if (thread === null) return null;

  const pathFromProjectRoot = pathFromSourcePath(
    docoIdRow.pathInSource ?? expectedPathInSource,
    proj.subpath,
  );
  const guidePath = `/${proj.orgSlug}/${proj.projectSlug}/${pathFromProjectRoot}`;
  const url = `${SITE_URL}${guidePath}/discussions/${discussionRef(thread.number, thread.title)}`;

  // Prior edited versions, fetched in parallel for the posts that were edited.
  const includeEdits = options.includeEdits ?? true;
  const editedReplies = includeEdits
    ? thread.replies.filter((reply) => reply.isEdited && !reply.removed)
    : [];
  const [opHistory, replyHistories] = await Promise.all([
    includeEdits && thread.op.isEdited
      ? getDiscussionEditHistory(thread.id)
      : Promise.resolve<EditVersion[] | null>([]),
    Promise.all(editedReplies.map((reply) => getReplyEditHistory(reply.id))),
  ]);
  const replyEdits = new Map<string, EditVersion[]>();
  editedReplies.forEach((reply, i) => replyEdits.set(reply.id, replyHistories[i] ?? []));

  return buildDiscussionMarkdown({
    thread,
    url,
    docoPath: guidePath,
    opEdits: opHistory ?? [],
    replyEdits,
  });
}

/** Resolves a doco's discussion list to a standalone markdown index, or null. */
export async function getDiscussionListMarkdown(
  orgSlug: string,
  projectSlug: string,
  docoPath: string,
  filter: ThreadFilter = "all",
): Promise<string | null> {
  const proj = await resolveProjectBySlug(orgSlug, projectSlug);
  if (proj === null) return null;
  const expectedPathInSource = rebuildPathInSource(docoPath, proj.subpath);
  const docoIdRow = await resolveDocoIdentity(proj.gitSourceId, expectedPathInSource);
  if (docoIdRow === null) return null;

  const [threads, header] = await Promise.all([
    listThreads(docoIdRow.docoId, filter),
    getDocoHeader(docoIdRow.latestPublishedVersionId),
  ]);
  const pathFromProjectRoot = pathFromSourcePath(
    docoIdRow.pathInSource ?? expectedPathInSource,
    proj.subpath,
  );
  const guidePath = `/${proj.orgSlug}/${proj.projectSlug}/${pathFromProjectRoot}`;
  const guideTitle = header.title ?? pathFromProjectRoot;

  const frontmatter = stringifyYaml({
    doco: guidePath,
    source: `${SITE_URL}${guidePath}/discussions`,
    count: threads.length,
  }).trimEnd();

  const lines = threads.map((t) => {
    const url = `${SITE_URL}${guidePath}/discussions/${discussionRef(t.number, t.title)}`;
    const tags = [
      t.status,
      t.isAnswered ? "answered" : "",
      t.isPinned ? "pinned" : "",
      `${String(t.replyCount)} ${t.replyCount === 1 ? "reply" : "replies"}`,
      t.authorDeleted ? "deleted account" : (t.authorDisplayName ?? `@${t.authorHandle}`),
    ].filter((tag) => tag.length > 0);
    return `- [#${String(t.number)} ${t.title}](${url}) · ${tags.join(" · ")}`;
  });
  const body = lines.length > 0 ? lines.join("\n") : "_No discussions yet._";

  return `---\n${frontmatter}\n---\n\n# Discussions: ${guideTitle}\n\n${body}\n`;
}
