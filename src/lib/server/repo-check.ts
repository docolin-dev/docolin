import { env } from "$lib/server/env";
import { parseGithubUrl, canonicalGithubUrl } from "$lib/git/github-url";
import { parseCodebergUrl, canonicalCodebergUrl } from "$lib/git/codeberg-url";
import type { ForgeProvider } from "$lib/git/forge";

// Repo reachability check for project creation, provider-detected from the
// URL's host. Used twice: live by the create form (via /api/github-repo-check)
// and authoritatively inside the create action on submit. Private repos are
// rejected on every forge: there is no owner-auth flow yet, and docolin
// content is public by invariant anyway.

export type RepoCheckResult =
  | {
      ok: true;
      provider: ForgeProvider;
      owner: string;
      repo: string;
      defaultBranch: string;
      canonicalUrl: string;
    }
  | { ok: false; reason: "invalid_url" | "not_found" | "rate_limited" | "private" | "network" };

interface RepoProbe {
  private?: boolean;
  default_branch?: string;
}

async function probe(
  apiUrl: string,
  headers: Record<string, string>,
): Promise<RepoProbe | Extract<RepoCheckResult, { ok: false }>> {
  // try-catch: live network call; a transient failure must surface as the
  // retryable "network" reason, not a crash.
  try {
    const res = await fetch(apiUrl, { headers });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (res.status === 403 || res.status === 429) return { ok: false, reason: "rate_limited" };
    if (!res.ok) return { ok: false, reason: "network" };
    return (await res.json()) as RepoProbe;
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function verifyForgeRepo(repoUrl: string): Promise<RepoCheckResult> {
  const github = parseGithubUrl(repoUrl);
  if (github !== null) {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "docolin",
    };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    const data = await probe(
      `https://api.github.com/repos/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repo)}`,
      headers,
    );
    if ("ok" in data) return data;
    if (data.private === true) return { ok: false, reason: "private" };
    return {
      ok: true,
      provider: "github",
      owner: github.owner,
      repo: github.repo,
      defaultBranch: data.default_branch ?? "main",
      canonicalUrl: canonicalGithubUrl(github),
    };
  }

  const codeberg = parseCodebergUrl(repoUrl);
  if (codeberg !== null) {
    const headers: Record<string, string> = { "User-Agent": "docolin" };
    if (env.CODEBERG_TOKEN) headers.Authorization = `token ${env.CODEBERG_TOKEN}`;
    const data = await probe(
      `https://codeberg.org/api/v1/repos/${encodeURIComponent(codeberg.owner)}/${encodeURIComponent(codeberg.repo)}`,
      headers,
    );
    if ("ok" in data) return data;
    if (data.private === true) return { ok: false, reason: "private" };
    return {
      ok: true,
      // Codeberg runs Forgejo; "gitea" is the stored provider for its
      // API-compatible family (already allowed by the schema check).
      provider: "gitea",
      owner: codeberg.owner,
      repo: codeberg.repo,
      defaultBranch: data.default_branch ?? "main",
      canonicalUrl: canonicalCodebergUrl(codeberg),
    };
  }

  return { ok: false, reason: "invalid_url" };
}
