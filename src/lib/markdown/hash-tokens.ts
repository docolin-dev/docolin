// The URL hash is a comma-separated list of share tokens owned by different
// features (code-block lines via `__codeline-`, diff lines via `__diffline-`).
// Every writer replaces only its own tokens and preserves everyone else's, so one
// shared link can light a code line and a diff line at once.

/** Replaces the hash's tokens starting with `prefix` by `tokens`, keeping every
 *  foreign token in place. Takes the raw `location.hash` (leading `#` optional)
 *  and returns the new hash body without the `#`, or "" when nothing remains. */
export function replaceHashTokens(hash: string, prefix: string, tokens: readonly string[]): string {
  const kept = hash
    .replace("#", "")
    .split(",")
    .filter((token) => token.length > 0 && !token.startsWith(prefix));
  return [...kept, ...tokens].join(",");
}
