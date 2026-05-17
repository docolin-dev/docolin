import { R2_PUBLIC_BASE } from "$env/static/private";

// R2 URL and key helpers. The R2 bucket itself comes straight from the
// Cloudflare Workers binding (event.platform.env.MEDIA_BUCKET); callers use
// bucket.put(...) directly without any wrapper layer.
//
// R2_PUBLIC_BASE is required per environment:
//   Dev:  R2_PUBLIC_BASE=https://media-dev.docolin.com  (docolin-media-dev)
//   Prod: R2_PUBLIC_BASE=https://media.docolin.com      (docolin-media)
//
// Static import means missing-config fails fast at build/typecheck, never
// silently with a wrong-domain default.

export function r2PublicBase(): string {
  return R2_PUBLIC_BASE.endsWith("/") ? R2_PUBLIC_BASE.slice(0, -1) : R2_PUBLIC_BASE;
}

export function r2PublicUrl(key: string): string {
  return `${r2PublicBase()}/${key}`;
}

// Storage key shape for sync-archived media: per-project hash dedup,
// extension preserved for browser content-type sniffing fallback.
// e.g. "550e8400.../a3f5d9b2....png"
export function projectMediaKey(projectId: string, contentHash: string, ext: string): string {
  const cleaned = (ext.startsWith(".") ? ext.slice(1) : ext).toLowerCase();
  return cleaned.length === 0
    ? `${projectId}/${contentHash}`
    : `${projectId}/${contentHash}.${cleaned}`;
}
