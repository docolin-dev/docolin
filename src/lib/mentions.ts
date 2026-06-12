// @handle mention extraction from discussion text. Character scan, no regex
// (CLAUDE.md 3.8): an "@" that starts a word, followed by a handle-shaped run
// (lowercase letters, digits, hyphens, 2+ chars). Emails don't match because
// their "@" follows a word character. Mentions inside code fences do match;
// markdown-aware scanning isn't worth the complexity for that false positive.

// Bounds the notification fan-out a single post can trigger.
const MAX_MENTIONS = 10;
const MIN_HANDLE_LENGTH = 2;
const MAX_HANDLE_LENGTH = 30;

function isHandleChar(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "-";
}

/** Unique handles mentioned as @handle, lowercased, in order of appearance. */
export function extractMentionHandles(text: string): string[] {
  const found = new Set<string>();
  for (let i = 0; i < text.length && found.size < MAX_MENTIONS; i++) {
    if (text[i] !== "@") continue;
    // Word boundary: start of text, or the previous char is not handle-shaped
    // (so user@example.com never reads as a mention of "example").
    if (i > 0 && (isHandleChar(text[i - 1]) || text[i - 1] === "@")) continue;
    let end = i + 1;
    while (end < text.length && isHandleChar(text[end])) end += 1;
    const handle = text.slice(i + 1, end).toLowerCase();
    if (handle.length >= MIN_HANDLE_LENGTH && handle.length <= MAX_HANDLE_LENGTH) {
      found.add(handle);
    }
    i = end - 1;
  }
  return [...found];
}
