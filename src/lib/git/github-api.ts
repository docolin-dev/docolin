import { GITHUB_TOKEN } from "$env/static/private";

// Thin client for the GitHub endpoints the sync engine uses:
//
//   - GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=true  (initial sync)
//   - GET /repos/{owner}/{repo}/compare/{base}...{head}          (incremental sync)
//   - GET /repos/{owner}/{repo}/tags                             (tag lookup)
//
// All return everything we need in a single call. File content fetching is
// offloaded to jsDelivr; this client never asks GitHub for raw bytes.
//
// Auth via GITHUB_TOKEN. Without a token GitHub allows 60 requests per hour
// per IP; fine for one-off testing, not for production sync. Empty-string
// token is treated as no auth (matches the .env.example default).

const GITHUB_API = "https://api.github.com";

function authHeaders(): Record<string, string> {
  const base: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "docolin-sync",
  };
  if (GITHUB_TOKEN) base.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return base;
}

// ---------- tree ----------

export interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

export interface GitHubTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitHubTreeEntry[];
}

// ---------- compare ----------

export type GitHubFileStatus =
  | "added"
  | "modified"
  | "removed"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

export interface GitHubCompareFile {
  filename: string;
  status: GitHubFileStatus;
  previousFilename?: string;
  sha: string;
}

export interface GitHubCompareCommit {
  sha: string;
  authorName: string;
  authorEmail: string;
  authorLogin: string | null;
  authoredAt: string;
}

export type GitHubCompareStatus = "ahead" | "behind" | "identical" | "diverged";

export interface GitHubCompareResponse {
  status: GitHubCompareStatus;
  resolvedSha: string;
  commits: GitHubCompareCommit[];
  files: GitHubCompareFile[];
  // True when GitHub capped the response. The compare endpoint tops out at
  // 250 commits / 300 files; beyond that we have to fall back to fresh-tree
  // diffing (rare, handled by the sync orchestrator).
  truncated: boolean;
}

// ---------- tags ----------

export interface GitHubTag {
  name: string;
  commitSha: string;
}

// ---------- result envelope ----------

export type GitHubResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: "auth_error" | "not_found" | "rate_limited" | "network_error" | "unexpected";
      message: string;
      retryAfterSeconds?: number;
    };

async function githubFetch<T>(
  path: string,
  validate: (raw: unknown) => T,
): Promise<GitHubResult<T>> {
  const url = `${GITHUB_API}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders() });
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : "network error",
    };
  }

  if (res.status === 401) {
    return { ok: false, reason: "auth_error", message: "GitHub rejected the token" };
  }
  if (res.status === 404) {
    return { ok: false, reason: "not_found", message: `GitHub 404: ${path}` };
  }
  if (res.status === 403 || res.status === 429) {
    // GitHub uses 403 for primary rate limits (with x-ratelimit headers) and
    // 429 for secondary rate limits. Both mean "back off."
    const reset = res.headers.get("x-ratelimit-reset");
    const retryAfter = res.headers.get("retry-after");
    let retryAfterSeconds: number | undefined;
    if (retryAfter !== null) {
      retryAfterSeconds = Number.parseInt(retryAfter, 10);
    } else if (reset !== null) {
      const resetEpoch = Number.parseInt(reset, 10);
      retryAfterSeconds = Math.max(0, resetEpoch - Math.floor(Date.now() / 1000));
    }
    return {
      ok: false,
      reason: "rate_limited",
      message: "GitHub rate-limited the request",
      retryAfterSeconds,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "unexpected",
      message: `GitHub returned ${String(res.status)} ${res.statusText}`,
    };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    return {
      ok: false,
      reason: "unexpected",
      message: err instanceof Error ? `JSON parse failed: ${err.message}` : "JSON parse failed",
    };
  }

  try {
    return { ok: true, value: validate(raw) };
  } catch (err) {
    return {
      ok: false,
      reason: "unexpected",
      message: err instanceof Error ? err.message : "response shape mismatch",
    };
  }
}

// ---------- response narrowing ----------

// Narrowing helpers, not full Zod validators. GitHub's responses are stable
// and we only touch the fields we care about; full schema validation would be
// overhead. Bail with a readable error if a critical field is missing.

function asObject(v: unknown, label: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new Error(`${label}: expected object`);
  }
  return v as Record<string, unknown>;
}

function asString(v: unknown, label: string): string {
  if (typeof v !== "string") throw new Error(`${label}: expected string`);
  return v;
}

function asArray(v: unknown, label: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${label}: expected array`);
  return v;
}

function narrowTree(raw: unknown): GitHubTreeResponse {
  const root = asObject(raw, "tree response");
  return {
    sha: asString(root.sha, "tree.sha"),
    truncated: root.truncated === true,
    tree: asArray(root.tree, "tree.tree").map((entry, i) => {
      const e = asObject(entry, `tree.tree[${String(i)}]`);
      const type = asString(e.type, `tree.tree[${String(i)}].type`);
      if (type !== "blob" && type !== "tree" && type !== "commit") {
        throw new Error(`tree.tree[${String(i)}].type unexpected: ${type}`);
      }
      const size = typeof e.size === "number" ? e.size : undefined;
      return {
        path: asString(e.path, `tree.tree[${String(i)}].path`),
        type,
        sha: asString(e.sha, `tree.tree[${String(i)}].sha`),
        size,
      };
    }),
  };
}

const COMPARE_STATUSES = ["ahead", "behind", "identical", "diverged"] as const;
const FILE_STATUSES = [
  "added",
  "modified",
  "removed",
  "renamed",
  "copied",
  "changed",
  "unchanged",
] as const;

function narrowCompare(raw: unknown): GitHubCompareResponse {
  const root = asObject(raw, "compare response");
  const status = asString(root.status, "compare.status");
  if (!(COMPARE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`compare.status unexpected: ${status}`);
  }
  const mergeBase = asObject(root.merge_base_commit, "compare.merge_base_commit");
  // The resolved current branch tip lives at the last commit in `commits[]`
  // (GitHub returns chronological order, oldest first). When the branches
  // are identical or behind, `commits[]` is empty and merge_base.sha is the
  // best we can do.
  const commitsRaw = asArray(root.commits, "compare.commits");
  let resolvedSha: string;
  const last = commitsRaw[commitsRaw.length - 1];
  if (last === undefined) {
    resolvedSha = asString(mergeBase.sha, "compare.merge_base_commit.sha");
  } else {
    const lastObj = asObject(last, "compare.commits[last]");
    resolvedSha = asString(lastObj.sha, "compare.commits[last].sha");
  }

  const filesRaw = root.files === undefined ? [] : asArray(root.files, "compare.files");

  return {
    status: status as GitHubCompareStatus,
    resolvedSha,
    truncated: commitsRaw.length >= 250 || filesRaw.length >= 300,
    commits: commitsRaw.map((c, i) => {
      const co = asObject(c, `compare.commits[${String(i)}]`);
      const inner = asObject(co.commit, `compare.commits[${String(i)}].commit`);
      const author = asObject(inner.author, `compare.commits[${String(i)}].commit.author`);
      const ghAuthor =
        co.author === null ? null : asObject(co.author, `compare.commits[${String(i)}].author`);
      return {
        sha: asString(co.sha, `compare.commits[${String(i)}].sha`),
        authorName: asString(author.name, `compare.commits[${String(i)}].commit.author.name`),
        authorEmail: asString(author.email, `compare.commits[${String(i)}].commit.author.email`),
        authorLogin:
          ghAuthor === null
            ? null
            : asString(ghAuthor.login, `compare.commits[${String(i)}].author.login`),
        authoredAt: asString(author.date, `compare.commits[${String(i)}].commit.author.date`),
      };
    }),
    files: filesRaw.map((f, i) => {
      const fo = asObject(f, `compare.files[${String(i)}]`);
      const fileStatus = asString(fo.status, `compare.files[${String(i)}].status`);
      if (!(FILE_STATUSES as readonly string[]).includes(fileStatus)) {
        throw new Error(`compare.files[${String(i)}].status unexpected: ${fileStatus}`);
      }
      const previousFilename =
        fo.previous_filename === undefined
          ? undefined
          : asString(fo.previous_filename, `compare.files[${String(i)}].previous_filename`);
      return {
        filename: asString(fo.filename, `compare.files[${String(i)}].filename`),
        status: fileStatus as GitHubFileStatus,
        previousFilename,
        sha: asString(fo.sha, `compare.files[${String(i)}].sha`),
      };
    }),
  };
}

// ---------- public API ----------

export function fetchTree(
  owner: string,
  repo: string,
  ref: string,
): Promise<GitHubResult<GitHubTreeResponse>> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=true`;
  return githubFetch(path, narrowTree);
}

export function fetchCompare(
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<GitHubResult<GitHubCompareResponse>> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
  return githubFetch(path, narrowCompare);
}

// Fetches the repo's tags. Caps at 100 results (GitHub's per_page max) without
// pagination: repos with >100 tags only get their first page recognized for
// version-tag display. Acceptable for v1; pagination can be bolted on if a
// real-world repo needs it.
export function fetchTags(owner: string, repo: string): Promise<GitHubResult<GitHubTag[]>> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=100`;
  return githubFetch(path, narrowTags);
}

function narrowTags(raw: unknown): GitHubTag[] {
  return asArray(raw, "tags").map((entry, i) => {
    const e = asObject(entry, `tags[${String(i)}]`);
    const commit = asObject(e.commit, `tags[${String(i)}].commit`);
    return {
      name: asString(e.name, `tags[${String(i)}].name`),
      commitSha: asString(commit.sha, `tags[${String(i)}].commit.sha`),
    };
  });
}
