import { and, eq } from "drizzle-orm";
import type { R2Bucket } from "@cloudflare/workers-types";
import { db } from "$lib/server/db";
import { projectMediaAssets } from "$lib/server/db/schema";
import { jsDelivrUrl } from "$lib/git/jsdelivr";
import { projectMediaKey, r2PublicUrl } from "./r2";
import { resolveRelativePath, isRelativePath } from "./path-resolve";

// Image archival for docs synced from a git repo. Body images <= 50 MB are
// downloaded, hashed, uploaded to R2, and the markdown rewritten to point at
// the R2 URL so the content survives source-repo removal. Larger assets keep
// pointing at the source (jsDelivr or external) and surface a warning.

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

export interface SyncFileErrorRecord {
  filePath: string;
  code: "asset_too_large" | "asset_fetch_failed" | "asset_upload_failed";
  message: string;
  details: Record<string, unknown>;
}

export interface ImageArchiverContext {
  bucket: R2Bucket;
  projectId: string;
  // Source repo coords used to absolutize relative URLs to jsDelivr URLs.
  owner: string;
  repo: string;
  ref: string;
  // The doco's path in the source repo. Used both to resolve relative URLs
  // against the right base directory and to attribute per-file errors.
  docoPath: string;
  // Sink for per-file errors that the orchestrator persists to sync_file_errors.
  // Passing a callback (rather than writing inline) keeps this module free of
  // transaction-management decisions.
  onError: (err: SyncFileErrorRecord) => void;
}

// Builds the rewriter function plugged into the body pipeline's image-rewrite
// stage. One archiver per doco; the body pipeline calls it once per image.
export function makeImageArchiver(ctx: ImageArchiverContext) {
  return async (sourceUrl: string): Promise<string> => {
    const absoluteUrl = absolutize(sourceUrl, ctx);
    if (absoluteUrl === null) {
      // Unknown form (e.g. data: URL). Leave untouched.
      return sourceUrl;
    }

    // Cheap size check before downloading. Skip archive if the asset is too
    // large; the markdown keeps pointing at the source so the image still
    // renders, with the tradeoff that it'll break if the source goes away.
    const sizeBytes = await safeHead(absoluteUrl);
    if (sizeBytes !== null && sizeBytes > MAX_ARCHIVE_BYTES) {
      ctx.onError({
        filePath: ctx.docoPath,
        code: "asset_too_large",
        message: `Asset is ${String(sizeBytes)} bytes, above the ${String(MAX_ARCHIVE_BYTES)} byte archive limit. Source URL kept as-is.`,
        details: { sourceUrl, absoluteUrl, sizeBytes },
      });
      return absoluteUrl;
    }

    const downloaded = await safeDownload(absoluteUrl);
    if (downloaded === null) {
      ctx.onError({
        filePath: ctx.docoPath,
        code: "asset_fetch_failed",
        message: `Could not fetch ${absoluteUrl} for archival. Source URL kept as-is.`,
        details: { sourceUrl, absoluteUrl },
      });
      return absoluteUrl;
    }

    // Same content within the same project = one R2 object. Different projects
    // intentionally store their own copies (simpler lifecycle on delete).
    const contentHash = await sha256Hex(downloaded.body);
    const existing = await db
      .select({ id: projectMediaAssets.id, url: projectMediaAssets.url })
      .from(projectMediaAssets)
      .where(
        and(
          eq(projectMediaAssets.projectId, ctx.projectId),
          eq(projectMediaAssets.contentHash, contentHash),
        ),
      )
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      const row = existing[0];
      await db
        .update(projectMediaAssets)
        .set({ lastSeenAt: now })
        .where(eq(projectMediaAssets.id, row.id));
      return row.url;
    }

    const ext = extensionFromUrlOrContentType(absoluteUrl, downloaded.contentType);
    const key = projectMediaKey(ctx.projectId, contentHash, ext);

    try {
      await ctx.bucket.put(key, downloaded.body, {
        httpMetadata:
          downloaded.contentType === null ? undefined : { contentType: downloaded.contentType },
      });
    } catch (err) {
      ctx.onError({
        filePath: ctx.docoPath,
        code: "asset_upload_failed",
        message: `R2 upload failed for ${absoluteUrl}: ${err instanceof Error ? err.message : "upload failed"}. Source URL kept as-is.`,
        details: { sourceUrl, absoluteUrl, key },
      });
      return absoluteUrl;
    }

    const url = r2PublicUrl(key);
    await db.insert(projectMediaAssets).values({
      projectId: ctx.projectId,
      contentHash,
      url,
      mimeType: downloaded.contentType,
      sizeBytes: downloaded.body.byteLength,
      firstSeenRef: ctx.ref,
      firstSeenAt: now,
      lastSeenAt: now,
    });

    return url;
  };
}

// --- helpers ---

function absolutize(rawUrl: string, ctx: ImageArchiverContext): string | null {
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/")) {
    // Absolute path within the repo. Strip the leading slash before joining.
    return jsDelivrUrl({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: ctx.ref,
      path: rawUrl.slice(1),
    });
  }
  if (isRelativePath(rawUrl)) {
    return jsDelivrUrl({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: ctx.ref,
      path: resolveRelativePath(ctx.docoPath, rawUrl),
    });
  }
  return null;
}

async function safeHead(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return null;
    const length = res.headers.get("content-length");
    if (length === null) return null;
    const n = Number.parseInt(length, 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

interface DownloadedAsset {
  body: ArrayBuffer;
  contentType: string | null;
}

async function safeDownload(url: string): Promise<DownloadedAsset | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get("content-type"),
    };
  } catch {
    return null;
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(hashBuffer);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

export function extensionFromUrlOrContentType(url: string, contentType: string | null): string {
  // Try the URL's filename first. Strip query/hash before looking at the dot.
  const queryIdx = url.indexOf("?");
  const hashIdx = url.indexOf("#");
  let endIdx = url.length;
  if (queryIdx >= 0) endIdx = Math.min(endIdx, queryIdx);
  if (hashIdx >= 0) endIdx = Math.min(endIdx, hashIdx);
  const pathOnly = url.slice(0, endIdx);

  const lastSlash = pathOnly.lastIndexOf("/");
  const filename = lastSlash >= 0 ? pathOnly.slice(lastSlash + 1) : pathOnly;
  const lastDot = filename.lastIndexOf(".");
  if (lastDot > 0 && lastDot < filename.length - 1) {
    return filename.slice(lastDot + 1).toLowerCase();
  }

  // Fall back to MIME subtype (image/png → png).
  if (contentType !== null) {
    const slash = contentType.indexOf("/");
    if (slash >= 0) {
      const sub = contentType.slice(slash + 1);
      const semi = sub.indexOf(";");
      return (semi >= 0 ? sub.slice(0, semi) : sub).trim().toLowerCase();
    }
  }
  return "";
}
