import { githubEditUrl } from "./github-url";
import { codebergEditUrl } from "./codeberg-url";

// Provider-aware "edit this file on the forge" URL. Host-sniffs the stored
// repo URL instead of threading the provider column through every viewer
// payload: the canonical repo URL is already in each surface that links out,
// and its host IS the provider. Client-safe (no env imports).
export function forgeEditUrl(repoUrl: string, branch: string, path: string): string {
  if (repoUrl.startsWith("https://codeberg.org/")) {
    return codebergEditUrl(repoUrl, branch, path);
  }
  return githubEditUrl(repoUrl, branch, path);
}
