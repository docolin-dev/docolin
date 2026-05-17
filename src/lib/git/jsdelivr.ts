// jsDelivr serves the raw contents of any public GitHub repo (and many other
// providers) via a free, edge-cached CDN. The sync engine uses it for content
// fetching so the GitHub API budget can be spent on the change-detection
// endpoints (tree + compare), not on per-file pulls.
//
// URL shape: https://cdn.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}
//
// `ref` can be a branch, a tag, or a commit SHA. SHAs are preferred for sync
// (immutable, no risk of mid-sync ref drift).

const JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh";

export interface JsDelivrTarget {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

export type JsDelivrResult =
  | { ok: true; content: string }
  | {
      ok: false;
      reason: "not_found" | "network_error" | "rate_limited" | "unexpected";
      message: string;
    };

// Builds the public jsDelivr URL for a target. Each path segment is encoded
// so spaces and special characters in paths don't break the URL. Exported so
// callers (image archival, sitemap fetch) can reconstruct URLs without going
// through the fetch path.
export function jsDelivrUrl(target: JsDelivrTarget): string {
  const encodedPath = target.path.split("/").map(encodeURIComponent).join("/");
  return `${JSDELIVR_BASE}/${target.owner}/${target.repo}@${target.ref}/${encodedPath}`;
}

export async function fetchFileFromJsDelivr(target: JsDelivrTarget): Promise<JsDelivrResult> {
  const url = jsDelivrUrl(target);

  let res: Response;
  try {
    res = await fetch(url);
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
      message: `File not found at jsDelivr: ${target.path}`,
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      reason: "rate_limited",
      message: "jsDelivr rate-limited the request",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "unexpected",
      message: `jsDelivr returned ${String(res.status)} ${res.statusText}`,
    };
  }

  const content = await res.text();
  return { ok: true, content };
}

export interface JsDelivrHeadResult {
  sizeBytes: number;
  contentType: string | null;
}

// Cheap size check used by the image archival pipeline before deciding whether
// to download + re-upload to R2. jsDelivr returns Content-Length reliably.
export async function headFileFromJsDelivr(
  target: JsDelivrTarget,
): Promise<
  | { ok: true; head: JsDelivrHeadResult }
  | { ok: false; reason: "not_found" | "network_error" | "unexpected"; message: string }
> {
  const url = jsDelivrUrl(target);
  let res: Response;
  try {
    res = await fetch(url, { method: "HEAD" });
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : "network error",
    };
  }

  if (res.status === 404) {
    return { ok: false, reason: "not_found", message: `Not found: ${target.path}` };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "unexpected",
      message: `HEAD returned ${String(res.status)} ${res.statusText}`,
    };
  }

  const length = res.headers.get("content-length");
  const sizeBytes = length === null ? 0 : Number.parseInt(length, 10);
  return {
    ok: true,
    head: {
      sizeBytes,
      contentType: res.headers.get("content-type"),
    },
  };
}
