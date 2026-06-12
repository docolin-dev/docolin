import type { GitHubFileStatus } from "./github-api";

// Net per-file status across a commit range. Forgejo's compare endpoint has
// no net diff (each commit carries its own file list), so the Codeberg client
// replays commits chronologically through this merge. Pure and separate from
// the client so it is unit-testable without env.

/** Merges one file's next per-commit status into its accumulated net status.
 *  Returns null when the file nets out to untouched (added then removed
 *  within the range). Unknown vocabulary degrades to "modified". */
export function mergeFileStatus(
  previous: GitHubFileStatus | null,
  next: string,
): GitHubFileStatus | null {
  const incoming: GitHubFileStatus =
    next === "added" || next === "removed" || next === "renamed" ? next : "modified";
  if (previous === null) return incoming;
  if (incoming === "removed") return previous === "added" ? null : "removed";
  if (previous === "removed") return "modified"; // deleted then recreated
  if (previous === "added") return "added"; // later edits keep it "new"
  return incoming;
}
