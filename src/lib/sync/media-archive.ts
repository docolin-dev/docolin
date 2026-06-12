import type { R2Bucket } from "@cloudflare/workers-types";
import { resolveRelativePath, isRelativePath } from "./path-resolve";

// Image handling for docs synced from a git repo.
//
// R2 archival is DISABLED for now. Archiving downloaded every image and froze it
// to an R2 copy, which is wrong for live assets: badges, star-history charts, and
// other dynamic images are meant to keep updating, and an R2 snapshot freezes
// them at sync time. Preserving history is nice, but not at the cost of breaking
// the things that are supposed to move.
//
// So we no longer download or upload anything. We only absolutize
// repo-relative/absolute URLs to their live jsDelivr source so they still render,
// and leave external URLs (and data: URLs) exactly as the author wrote them.
//
// The bucket/projectId/onError context fields and SyncFileErrorRecord are kept so
// re-enabling archival later (likely with a smarter "archive repo-local, leave
// dynamic externals alone" rule) is a localized change to this file.

export interface SyncFileErrorRecord {
  filePath: string;
  code: "asset_too_large" | "asset_fetch_failed" | "asset_upload_failed";
  message: string;
  details: Record<string, unknown>;
}

export interface ImageArchiverContext {
  bucket: R2Bucket;
  projectId: string;
  // Builds the public raw-content URL for a repo path (provider-specific:
  // jsDelivr for GitHub, codeberg.org raw for Forgejo), used to absolutize
  // relative image references.
  rawUrl: (path: string) => string;
  // The doco's path in the source repo, the base directory for relative URLs.
  docoPath: string;
  // Base directory for root-absolute URLs (`/images/x`). Null = repo root (the
  // docolin default). For a Mintlify import this is the docs root (the subpath),
  // because Mintlify authors absolute asset paths relative to the docs root.
  absoluteBase?: string | null;
  // Sink for per-file errors. Currently unused (archival is off) but kept so
  // re-enabling archival doesn't need to re-thread it through the orchestrator.
  onError: (err: SyncFileErrorRecord) => void;
}

// Builds the rewriter plugged into the body pipeline's image-rewrite stage. One
// per doco; the body pipeline calls it once per image. With archival off this is
// pure URL resolution: repo-relative/absolute -> live jsDelivr URL, external and
// data: URLs untouched.
export function makeImageArchiver(ctx: ImageArchiverContext) {
  return (sourceUrl: string): Promise<string> => {
    const absoluteUrl = absolutize(sourceUrl, ctx);
    return Promise.resolve(absoluteUrl ?? sourceUrl);
  };
}

// --- helpers ---

function absolutize(rawUrl: string, ctx: ImageArchiverContext): string | null {
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/")) {
    // Root-absolute path. Resolve against the configured base (repo root by
    // default; the docs root for a Mintlify import), stripping the leading slash.
    const rel = rawUrl.slice(1);
    const base = ctx.absoluteBase;
    const path = base !== null && base !== undefined && base.length > 0 ? `${base}/${rel}` : rel;
    return ctx.rawUrl(path);
  }
  if (isRelativePath(rawUrl)) {
    return ctx.rawUrl(resolveRelativePath(ctx.docoPath, rawUrl));
  }
  return null;
}
