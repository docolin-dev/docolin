import { error, json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";
import { parseGithubUrl } from "$lib/git/github-url";

// Live reachability check for a GitHub repo URL on the project-create form.
// Server hits GitHub's repo endpoint with the configured GITHUB_TOKEN (or
// anonymous if unset). 5000/hr authenticated is plenty for interactive use;
// the same check runs again server-side on form submit as the authoritative
// guard.
export const GET: RequestHandler = async ({ url, locals }) => {
  // Auth gate: only signed-in + onboarded users hit this. No need to leak
  // the endpoint to anonymous traffic.
  if (!locals.dbUser) error(404);

  const repoUrl = url.searchParams.get("url") ?? "";
  const parsed = parseGithubUrl(repoUrl);
  if (!parsed) {
    return json({ ok: false, reason: "invalid_url" });
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "docolin",
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
      headers,
    });
    if (res.status === 404) return json({ ok: false, reason: "not_found" });
    if (res.status === 403 || res.status === 429) {
      return json({ ok: false, reason: "rate_limited" });
    }
    if (!res.ok) return json({ ok: false, reason: "network" });
    const data = (await res.json()) as { private?: boolean; default_branch?: string };
    // Private repos are out of scope for now (we have no auth flow for the
    // repo owner). Even if the token can see private repos, we shouldn't
    // accept them as project sources yet.
    if (data.private === true) return json({ ok: false, reason: "private" });
    return json({
      ok: true,
      owner: parsed.owner,
      repo: parsed.repo,
      defaultBranch: data.default_branch ?? "main",
    });
  } catch {
    return json({ ok: false, reason: "network" });
  }
};
