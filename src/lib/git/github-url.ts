// Parse a GitHub repo URL into its owner + repo components. Accepts the
// HTTPS form (with or without .git suffix and trailing slash) and the SSH
// form. No regex per CLAUDE.md 3.8, pure string operations.
//
// Lives in $lib/git/ since other adapters (gitlab, codeberg, etc.) will
// follow the same shape when we add them.

export interface ParsedGithubRepo {
  owner: string;
  repo: string;
}

const HTTPS_PREFIX = "https://github.com/";
const HTTP_PREFIX = "http://github.com/";
const SSH_PREFIX = "git@github.com:";
const GIT_SUFFIX = ".git";

export function parseGithubUrl(input: string): ParsedGithubRepo | null {
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

  // Reject anything that looks like a sub-path beyond owner/repo, e.g.
  // https://github.com/owner/repo/tree/main. The user should give us the
  // base repo URL; subpath is its own form field.
  if (rest.includes("/")) return null;

  return { owner, repo: rest };
}

// Canonical https form, used as the source-of-truth string we store on
// git_sources.repo_url so two equivalent URLs (with or without .git suffix
// etc.) don't get treated as different repos.
export function canonicalGithubUrl(parsed: ParsedGithubRepo): string {
  return `https://github.com/${parsed.owner}/${parsed.repo}`;
}

// Strip the trailing slash off a stored repo URL before composing a longer
// URL on top of it. The DB column has no normalization guarantee beyond
// what canonicalGithubUrl produces; this is the defensive layer.
function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// Web URL that opens the GitHub editor for a specific file on a specific
// branch. Used by both the dashboard's per-file error UI and the public
// doco viewer's "Edit on GitHub" affordance. Path segments are encoded
// individually so spaces / non-ascii in filenames don't break the URL.
export function githubEditUrl(repoUrl: string, branch: string, path: string): string {
  const base = trimTrailingSlash(repoUrl);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/edit/${encodeURIComponent(branch)}/${encodedPath}`;
}

// Repo-level Discussions tab. GitHub will redirect to the enable-discussions
// prompt for owners if the repo hasn't enabled them; for readers without
// write access it 404s. Acceptable for v1; future iterations can store a
// has_discussions flag at sync time and fall back to /issues here.
export function githubDiscussionsUrl(repoUrl: string): string {
  return `${trimTrailingSlash(repoUrl)}/discussions`;
}
