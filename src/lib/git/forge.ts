import * as github from "./github-api";
import * as codeberg from "./codeberg-api";
import { fetchFileFromJsDelivr, jsDelivrUrl, type JsDelivrResult } from "./jsdelivr";
import { parseGithubUrl, type ParsedGithubRepo } from "./github-url";
import { parseCodebergUrl } from "./codeberg-url";
import type {
  GitHubCompareResponse,
  GitHubResult,
  GitHubTag,
  GitHubTreeResponse,
} from "./github-api";

// The provider seam for the sync pipeline. Every provider client normalizes
// to the github-api response shapes (the orchestrator's lingua franca), so
// the orchestrator stays provider-agnostic and a new forge is one new client
// module plus a branch here. "gitea" covers Codeberg, which runs Forgejo's
// Gitea-compatible API.

export type ForgeProvider = "github" | "gitea";

export function isForgeProvider(value: string): value is ForgeProvider {
  return value === "github" || value === "gitea";
}

/** Owner/repo-bound client for one repository on one forge. */
export interface Forge {
  fetchTree(ref: string): Promise<GitHubResult<GitHubTreeResponse>>;
  fetchCompare(base: string, head: string): Promise<GitHubResult<GitHubCompareResponse>>;
  fetchTags(): Promise<GitHubResult<GitHubTag[]>>;
  /** Raw file content at a ref. GitHub routes through jsDelivr (spares the
   *  API budget); Codeberg serves raw content directly. */
  fetchFile(ref: string, path: string): Promise<JsDelivrResult>;
  /** Public URL of a raw file, for absolutizing in-doco image references. */
  rawFileUrl(ref: string, path: string): string;
}

export function forgeFor(provider: ForgeProvider, owner: string, repo: string): Forge {
  if (provider === "gitea") {
    return {
      fetchTree: (ref) => codeberg.fetchTree(owner, repo, ref),
      fetchCompare: (base, head) => codeberg.fetchCompare(owner, repo, base, head),
      fetchTags: () => codeberg.fetchTags(owner, repo),
      fetchFile: (ref, path) => codeberg.fetchFileFromCodeberg({ owner, repo, ref, path }),
      rawFileUrl: (ref, path) => codeberg.codebergRawUrl({ owner, repo, ref, path }),
    };
  }
  return {
    fetchTree: (ref) => github.fetchTree(owner, repo, ref),
    fetchCompare: (base, head) => github.fetchCompare(owner, repo, base, head),
    fetchTags: () => github.fetchTags(owner, repo),
    fetchFile: (ref, path) => fetchFileFromJsDelivr({ owner, repo, ref, path }),
    rawFileUrl: (ref, path) => jsDelivrUrl({ owner, repo, ref, path }),
  };
}

/** Parses a repo URL with the provider's host rules. Same owner/repo shape
 *  for every forge. */
export function parseForgeRepoUrl(provider: ForgeProvider, url: string): ParsedGithubRepo | null {
  return provider === "gitea" ? parseCodebergUrl(url) : parseGithubUrl(url);
}
