// Shared helpers for the forge webhook receivers, so the GitHub and
// Forgejo/Gitea handlers stay identical where their logic is the same.

// True when the push payload's ref is the project's default branch. A body we
// can't parse (never a real forge push) is treated as non-matching. The try is
// unavoidable: JSON.parse throws on a malformed payload we don't control.
export function pushedDefaultBranch(body: string, defaultBranch: string): boolean {
  let ref: unknown;
  try {
    ref = (JSON.parse(body) as { ref?: unknown }).ref;
  } catch {
    return false;
  }
  return ref === `refs/heads/${defaultBranch}`;
}
