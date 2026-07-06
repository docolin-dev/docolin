// Sign-in flows carry a `returnTo` path so the user lands back where they
// started. Every consumer MUST pass it through this guard before redirecting:
// the value round-trips through the URL (and the OAuth state), so an attacker
// can mint links like /signin?returnTo=https://evil.example that bounce a
// victim through real docolin auth onto their site (an open redirect).

/** The returnTo path if it is same-origin-safe, else the fallback. Safe means
 *  a relative path: starts with "/" but not "//" or "/\" (browsers treat both
 *  as protocol-relative URLs, i.e. an absolute hop to another host). */
export function safeReturnPathname(raw: string | null | undefined, fallback = "/"): string {
  if (raw === undefined || raw === null) return fallback;
  // The URL parser strips ASCII tab, LF, and CR BEFORE interpreting a URL, so
  // "/\t/evil.example" reaches the browser as "//evil.example". Strip the same
  // characters first so the check below sees what the browser will see, and
  // return the cleaned value, never the raw one.
  let path = "";
  for (const c of raw) {
    if (c !== "\t" && c !== "\n" && c !== "\r") path += c;
  }
  if (path === "") return fallback;
  if (!path.startsWith("/")) return fallback;
  const second = path.charAt(1);
  if (second === "/" || second === "\\") return fallback;
  return path;
}
