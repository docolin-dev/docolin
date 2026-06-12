// Codeberg (Forgejo) repo URL parsing and web-URL building, mirroring
// github-url.ts. Same owner/repo shape, same canonicalization contract. No
// regex per CLAUDE.md 3.8.

export interface ParsedCodebergRepo {
  owner: string;
  repo: string;
}

const HTTPS_PREFIX = "https://codeberg.org/";
const HTTP_PREFIX = "http://codeberg.org/";
const SSH_PREFIX = "git@codeberg.org:";
const GIT_SUFFIX = ".git";

export function parseCodebergUrl(input: string): ParsedCodebergRepo | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  let path: string;
  if (trimmed.startsWith(HTTPS_PREFIX)) path = trimmed.slice(HTTPS_PREFIX.length);
  else if (trimmed.startsWith(HTTP_PREFIX)) path = trimmed.slice(HTTP_PREFIX.length);
  else if (trimmed.startsWith(SSH_PREFIX)) path = trimmed.slice(SSH_PREFIX.length);
  else return null;

  if (path.endsWith(GIT_SUFFIX)) path = path.slice(0, -GIT_SUFFIX.length);
  while (path.endsWith("/")) path = path.slice(0, -1);

  const slash = path.indexOf("/");
  if (slash === -1) return null;
  const owner = path.slice(0, slash);
  const rest = path.slice(slash + 1);
  if (owner.length === 0 || rest.length === 0) return null;
  if (rest.includes("/")) return null;

  return { owner, repo: rest };
}

export function canonicalCodebergUrl(parsed: ParsedCodebergRepo): string {
  return `https://codeberg.org/${parsed.owner}/${parsed.repo}`;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Forgejo's web editor URL for a file on a branch (the `_edit` route). */
export function codebergEditUrl(repoUrl: string, branch: string, path: string): string {
  const base = trimTrailingSlash(repoUrl);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/_edit/${encodeURIComponent(branch)}/${encodedPath}`;
}
