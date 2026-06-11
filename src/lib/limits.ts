// Input size limits, the single source of truth for client and server. The
// client uses them for maxlength attributes and counters (friendly UX); the
// server enforces the same numbers at the action/API boundary (the real gate,
// a crafted request walks straight past any client attribute). Keep both sides
// reading from here so they can never drift.
export const LIMITS = {
  /** Discussion title. Single line, matches the composer's input cap. */
  discussionTitle: 200,
  /** Discussion post and reply bodies. GitHub-comment territory; also bounds
   *  the markdown render CPU a single post can cost on read. */
  discussionBody: 50_000,
  /** Report / deletion-request details. Context for moderators, not content. */
  moderationDetails: 2_000,
  /** User, org, and project display names. */
  displayName: 64,
  /** Search query (web + MCP, which proxies to the same API). Truncated
   *  silently, not rejected: it bounds the Workers AI embedding cost, and no
   *  meaningful query loses results at this length. */
  searchQuery: 256,
} as const;

// Largest accepted body on a write request. Generous (the biggest legitimate
// form is a discussion body well under 256 KB) but stops a multi-megabyte POST
// from burning Worker CPU in formData() before field-level checks even run.
const MAX_WRITE_BODY_BYTES = 256 * 1024;

/** Whether a write request's declared body exceeds the accepted size. Browsers
 *  always send content-length for form posts; a missing header passes (the
 *  field-level limits still apply after parsing). */
export function isRequestBodyTooLarge(request: Request): boolean {
  const length = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(length) && length > MAX_WRITE_BODY_BYTES;
}
