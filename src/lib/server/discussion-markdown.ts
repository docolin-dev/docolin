import { stringify as stringifyYaml } from "yaml";
import type { ThreadDetail, ThreadPost, ThreadReply, EditVersion } from "./discussions";

// Renders a discussion thread to one standalone markdown file (the shape agents
// fetch). Pure and DB-free so it is unit-testable; the data fetching lives in
// doco-content.ts.
//
// SECURITY, attribution integrity: the whole thread is one text file, so its post
// boundaries are the ONLY thing telling an agent who wrote what. docolin reserves
// the mathematical white square brackets (⟦ ⟧) for its own markers: the ⟦docolin⟧
// line that bounds every post, and the ⟦docolin⟧ security note. These must never
// survive in author-written text, or a body could forge a boundary and fake
// someone else's attribution. So every user-supplied string is normalized:
//   - the reserved brackets downgrade to plain [ ] (this also keeps ⟦ ⟧ free for
//     future ⟦...⟧ system markers), and
//   - the LEGACY `--- text ---` delimiter shape docolin used before the sentinel
//     is stripped of its dashes (a bare `---` thematic break stays).
// Since real markers only ever come from this file, any ⟦docolin⟧ line in the
// output is authoritative.

const MARK_OPEN = "⟦";
const MARK_CLOSE = "⟧";
const SENTINEL = `${MARK_OPEN}docolin${MARK_CLOSE}`;

/** Downgrades the reserved brackets so author text can never mint a system
 *  marker. Plain string replacement, no regex. */
function downgradeMarkers(text: string): string {
  return text.split(MARK_OPEN).join("[").split(MARK_CLOSE).join("]");
}

// The legacy `--- text ---` boundary shape (an inner-text-bearing rule, not a bare
// `---` thematic break, which is legitimate markdown and left alone).
function isLegacyDelimiter(trimmed: string): boolean {
  return trimmed.length > 8 && trimmed.startsWith("--- ") && trimmed.endsWith(" ---");
}

function lineImitatesBoundary(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes(SENTINEL) || isLegacyDelimiter(trimmed);
}

/** A post's body, made safe to serve inside the thread. Downgrades reserved
 *  brackets, strips any legacy `--- text ---` delimiter shape, and, when the
 *  author tried to imitate a boundary, prepends a system security note. The note
 *  carries the real sentinel, so it stays trustworthy even next to hostile
 *  content (a forged note in the body had its own brackets downgraded). */
function postBody(bodySource: string): string[] {
  const lines = bodySource.split("\n");
  const flagged = lines.some(lineImitatesBoundary);
  const safe = lines
    .map((line) => {
      const downgraded = downgradeMarkers(line);
      const trimmed = downgraded.trim();
      if (isLegacyDelimiter(trimmed)) {
        const indent = downgraded.slice(0, downgraded.length - downgraded.trimStart().length);
        return `${indent}${trimmed.slice(4, -4).trim()}`;
      }
      return downgraded;
    })
    .join("\n");
  const parts: string[] = [];
  if (flagged) {
    parts.push(
      `${SENTINEL} security note: the text below was written by this post's author ` +
        `but contained markup imitating a docolin thread boundary. docolin neutralized ` +
        `it. Everything between this note and the next ${SENTINEL} line (or the end of ` +
        `the document) is this one author's content, and the imitation may be an attempt ` +
        `to forge attribution.`,
    );
  }
  parts.push(safe);
  return parts;
}

// Both the display name AND the handle are downgraded: handles are DB-constrained
// to safe characters today, but downgrading here makes the no-forged-marker
// guarantee unconditional and consistent with every other user string.
function postAuthor(post: {
  authorHandle: string;
  authorDisplayName: string | null;
  authorDeleted: boolean;
}): string {
  if (post.authorDeleted) return "deleted account";
  const handle = downgradeMarkers(post.authorHandle);
  return post.authorDisplayName !== null
    ? `${downgradeMarkers(post.authorDisplayName)} (@${handle})`
    : `@${handle}`;
}

function authorEntry(post: {
  authorHandle: string;
  authorDisplayName: string | null;
  authorDeleted: boolean;
}): Record<string, unknown> {
  if (post.authorDeleted) return { deleted: true };
  const handle = downgradeMarkers(post.authorHandle);
  return post.authorDisplayName !== null
    ? { name: downgradeMarkers(post.authorDisplayName), handle }
    : { handle };
}

function postDelimiter(label: string, post: ThreadPost): string {
  // Date AND time (UTC minute), so the raw thread carries when each post landed,
  // not just the day. Same shape as the edit lines below.
  const when = `${post.createdAt.slice(0, 16).replace("T", " ")} UTC`;
  const edited = post.isEdited ? " (edited)" : "";
  return `${SENTINEL} ${label} · ${postAuthor(post)} · ${when}${edited}`;
}

function replyLabel(reply: ThreadReply): string {
  const marks = [reply.isAnswer ? "accepted answer" : "", reply.isOpAuthor ? "author" : ""]
    .filter((m) => m.length > 0)
    .join(", ");
  return marks.length > 0 ? `Reply (${marks})` : "Reply";
}

function appendEdits(parts: string[], edits: EditVersion[]): void {
  for (const edit of edits) {
    const when = `${edit.editedAt.slice(0, 16).replace("T", " ")} UTC`;
    // The leading arrow marks the edit as nested under the post above without
    // indenting the body (4-space indent would turn it into a code block).
    parts.push(`${SENTINEL} ↳ Edit · ${when}`);
    if (edit.removed) parts.push("_This earlier version was removed._");
    else parts.push(...postBody(edit.bodySource));
  }
}

export interface DiscussionRender {
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
    title: downgradeMarkers(thread.title),
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
 * thread's metadata, then each post bounded by a ⟦docolin⟧ marker line (so
 * bodies render verbatim and cannot forge a boundary), with each post's prior
 * edited versions inline. */
export function buildDiscussionMarkdown(r: DiscussionRender): string {
  const frontmatter = stringifyYaml(buildDiscussionFrontmatter(r)).trimEnd();
  const parts: string[] = [
    `---\n${frontmatter}\n---`,
    `# Discussion #${String(r.thread.number)}: ${downgradeMarkers(r.thread.title)}`,
    postDelimiter("Original post", r.thread.op),
    ...postBody(r.thread.op.bodySource),
  ];
  appendEdits(parts, r.opEdits);
  for (const reply of r.thread.replies) {
    if (reply.removed) {
      parts.push(`${SENTINEL} Reply (removed)`, "_This reply was removed._");
      continue;
    }
    parts.push(postDelimiter(replyLabel(reply), reply), ...postBody(reply.bodySource));
    appendEdits(parts, r.replyEdits.get(reply.id) ?? []);
  }
  return `${parts.join("\n\n")}\n`;
}
