import { env } from "$lib/server/env";
import type {
  GitHubCompareFile,
  GitHubCompareResponse,
  GitHubFileStatus,
  GitHubResult,
  GitHubTag,
  GitHubTreeEntry,
  GitHubTreeResponse,
} from "./github-api";
import type { JsDelivrResult } from "./jsdelivr";
import { mergeFileStatus } from "./forge-compare";

// Codeberg (Forgejo) client, normalized to the exact response shapes the sync
// orchestrator already consumes from github-api.ts. The differences, verified
// against the live Codeberg API (2026-06):
//
//   - /git/trees pages at 1000 entries (page + total_count + truncated), so
//     fetchTree loops pages where GitHub returns everything at once.
//   - /compare returns commits NEWEST-first (GitHub: oldest-first) and has no
//     net per-file diff: the top-level files are the per-commit lists
//     concatenated, with duplicates and no rename info. fetchCompare replays
//     the commits chronologically and merges per-file statuses into the net
//     status the orchestrator expects; renames degrade to removed + added,
//     which the orchestrator already handles as delete-then-create.
//   - No compare `status` field; derived from total_commits.
//   - Raw content comes straight from codeberg.org (no jsDelivr for Forgejo).
//
// Auth via optional CODEBERG_TOKEN (`Authorization: token ...`); anonymous
// works for public repos with Codeberg's default rate limits.

const CODEBERG_API = "https://codeberg.org/api/v1";
const CODEBERG_WEB = "https://codeberg.org";

// Forgejo's tree page size; the loop cap bounds a pathological repo at 50k
// files, far beyond any docs repo.
const TREE_PAGE_SIZE = 1000;
const TREE_MAX_PAGES = 50;

function authHeaders(): Record<string, string> {
  const base: Record<string, string> = { "User-Agent": "docolin-sync" };
  const token = env.CODEBERG_TOKEN;
  if (token) base.Authorization = `token ${token}`;
  return base;
}

async function codebergFetch<T>(
  path: string,
  validate: (raw: unknown) => T,
): Promise<GitHubResult<T>> {
  const url = `${CODEBERG_API}${path}`;
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

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "auth_error", message: "Codeberg rejected the request" };
  }
  if (res.status === 404) {
    return { ok: false, reason: "not_found", message: `Codeberg 404: ${path}` };
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    return {
      ok: false,
      reason: "rate_limited",
      message: "Codeberg rate-limited the request",
      retryAfterSeconds: retryAfter === null ? undefined : Number.parseInt(retryAfter, 10),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "unexpected",
      message: `Codeberg returned ${String(res.status)} ${res.statusText}`,
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

// ---------- narrowing helpers (same style as github-api) ----------

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

// ---------- tree ----------

interface TreePage {
  sha: string;
  totalCount: number;
  entries: GitHubTreeEntry[];
}

function narrowTreePage(raw: unknown): TreePage {
  const root = asObject(raw, "tree response");
  const total = root.total_count;
  if (typeof total !== "number") throw new Error("tree.total_count: expected number");
  const list = root.tree === null ? [] : asArray(root.tree, "tree.tree");
  return {
    sha: asString(root.sha, "tree.sha"),
    totalCount: total,
    entries: list.map((entry, i) => {
      const e = asObject(entry, `tree.tree[${String(i)}]`);
      const type = asString(e.type, `tree.tree[${String(i)}].type`);
      return {
        path: asString(e.path, `tree.tree[${String(i)}].path`),
        // Forgejo uses blob/tree/commit like GitHub; anything else degrades to
        // tree (non-blob), which the orchestrator skips.
        type: type === "blob" || type === "commit" ? type : "tree",
        sha: asString(e.sha, `tree.tree[${String(i)}].sha`),
        size: typeof e.size === "number" ? e.size : undefined,
      };
    }),
  };
}

export async function fetchTree(
  owner: string,
  repo: string,
  ref: string,
): Promise<GitHubResult<GitHubTreeResponse>> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}`;
  const all: GitHubTreeEntry[] = [];
  let sha = "";
  let totalCount = 0;

  for (let page = 1; page <= TREE_MAX_PAGES; page++) {
    const result = await codebergFetch(
      `${base}?recursive=true&per_page=${String(TREE_PAGE_SIZE)}&page=${String(page)}`,
      narrowTreePage,
    );
    if (!result.ok) return result;
    sha = result.value.sha;
    totalCount = result.value.totalCount;
    all.push(...result.value.entries);
    if (all.length >= totalCount || result.value.entries.length === 0) break;
  }

  return { ok: true, value: { sha, truncated: all.length < totalCount, tree: all } };
}

// ---------- compare ----------

interface CodebergCompare {
  totalCommits: number;
  // Newest first, as returned.
  commits: {
    sha: string;
    authorName: string;
    authorEmail: string;
    authorLogin: string | null;
    authoredAt: string;
    files: { filename: string; status: string }[];
  }[];
}

function narrowCompare(raw: unknown): CodebergCompare {
  const root = asObject(raw, "compare response");
  const total = root.total_commits;
  if (typeof total !== "number") throw new Error("compare.total_commits: expected number");
  return {
    totalCommits: total,
    commits: asArray(root.commits, "compare.commits").map((c, i) => {
      const co = asObject(c, `compare.commits[${String(i)}]`);
      const inner = asObject(co.commit, `compare.commits[${String(i)}].commit`);
      const author = asObject(inner.author, `compare.commits[${String(i)}].commit.author`);
      const outerAuthor =
        co.author === null || co.author === undefined
          ? null
          : asObject(co.author, `compare.commits[${String(i)}].author`);
      const filesRaw =
        co.files === undefined || co.files === null
          ? []
          : asArray(co.files, `compare.commits[${String(i)}].files`);
      return {
        sha: asString(co.sha, `compare.commits[${String(i)}].sha`),
        authorName: asString(author.name, `compare.commits[${String(i)}].commit.author.name`),
        authorEmail: asString(author.email, `compare.commits[${String(i)}].commit.author.email`),
        authorLogin:
          outerAuthor === null
            ? null
            : asString(outerAuthor.login, `compare.commits[${String(i)}].author.login`),
        authoredAt: asString(author.date, `compare.commits[${String(i)}].commit.author.date`),
        files: filesRaw.map((f, j) => {
          const fo = asObject(f, `compare.commits[${String(i)}].files[${String(j)}]`);
          return {
            filename: asString(fo.filename, `…files[${String(j)}].filename`),
            status: asString(fo.status, `…files[${String(j)}].status`),
          };
        }),
      };
    }),
  };
}

export async function fetchCompare(
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<GitHubResult<GitHubCompareResponse>> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
  const result = await codebergFetch(path, narrowCompare);
  if (!result.ok) return result;

  const { totalCommits, commits } = result.value;
  // Chronological replay (the API returns newest first) to net out each
  // file's status across the range.
  const net = new Map<string, GitHubFileStatus | null>();
  for (const commit of [...commits].reverse()) {
    for (const file of commit.files) {
      net.set(file.filename, mergeFileStatus(net.get(file.filename) ?? null, file.status));
    }
  }
  const files: GitHubCompareFile[] = [];
  for (const [filename, status] of net) {
    // Forgejo carries no blob sha per file; the orchestrator never reads it
    // (fetches go by ref + path), so the head sha is an honest placeholder.
    if (status !== null) files.push({ filename, status, sha: commits[0]?.sha ?? head });
  }

  return {
    ok: true,
    value: {
      status: totalCommits === 0 ? "identical" : "ahead",
      // Newest commit, or the base itself when the range is empty.
      resolvedSha: commits[0]?.sha ?? base,
      commits: [...commits]
        .reverse()
        .map(({ sha, authorName, authorEmail, authorLogin, authoredAt }) => ({
          sha,
          authorName,
          authorEmail,
          authorLogin,
          authoredAt,
        })),
      files,
      // The API capping the commit list means the file set is incomplete;
      // the orchestrator falls back to asking for a full re-sync.
      truncated: totalCommits > commits.length,
    },
  };
}

// ---------- tags ----------

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

export function fetchTags(owner: string, repo: string): Promise<GitHubResult<GitHubTag[]>> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?limit=100`;
  return codebergFetch(path, narrowTags);
}

// ---------- raw content ----------

function isHexSha(ref: string): boolean {
  if (ref.length !== 40) return false;
  for (const c of ref) {
    const isHex = (c >= "0" && c <= "9") || (c >= "a" && c <= "f");
    if (!isHex) return false;
  }
  return true;
}

/** Public raw-content URL on codeberg.org. Sync passes commit SHAs (immutable);
 *  branch names route through the branch raw path. */
export function codebergRawUrl(target: {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}): string {
  const encodedPath = target.path.split("/").map(encodeURIComponent).join("/");
  const kind = isHexSha(target.ref) ? "commit" : "branch";
  return `${CODEBERG_WEB}/${target.owner}/${target.repo}/raw/${kind}/${encodeURIComponent(target.ref)}/${encodedPath}`;
}

export async function fetchFileFromCodeberg(target: {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}): Promise<JsDelivrResult> {
  const url = codebergRawUrl(target);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "docolin-sync" } });
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : "network error",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      reason: "not_found",
      message: `File not found at Codeberg: ${target.path}`,
    };
  }
  if (res.status === 429) {
    return { ok: false, reason: "rate_limited", message: "Codeberg rate-limited the request" };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "unexpected",
      message: `Codeberg returned ${String(res.status)} ${res.statusText}`,
    };
  }
  return { ok: true, content: await res.text() };
}
