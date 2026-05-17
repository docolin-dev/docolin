import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { gitSources } from "$lib/server/db/schema";
import { syncProject } from "$lib/sync/run";

// GitHub webhook receiver. Validates the HMAC signature against the project's
// stored webhook secret, then fires a sync as a fire-and-forget background
// job (via waitUntil) and returns 202 immediately.
//
// Webhook setup: the user configures `https://docolin.com/api/webhooks/github/{projectId}`
// in their GitHub repo's webhook settings, with the secret docolin gave them
// at project setup time. docolin stores that same secret on
// `git_sources.webhook_secret_hash` and uses it as the HMAC key.
//
// Projects without a configured webhook (webhook_secret_hash IS NULL) reject
// with 404 — webhooks are an opt-in power-user feature on top of hourly polling.

export const POST: RequestHandler = async ({ request, params, platform }) => {
  const projectId = params.projectId;

  const source = await db
    .select({
      id: gitSources.id,
      projectId: gitSources.projectId,
      webhookSecretHash: gitSources.webhookSecretHash,
    })
    .from(gitSources)
    .where(eq(gitSources.projectId, projectId))
    .limit(1);

  if (source.length === 0 || source[0].webhookSecretHash === null) {
    // 404 (not 401) so probes can't distinguish "no webhook configured" from
    // "bad signature" — both look like missing endpoints.
    error(404, "webhook not configured");
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (signature === null) error(401, "missing signature");

  const body = await request.text();
  const valid = await verifyGithubSignature(body, signature, source[0].webhookSecretHash);
  if (!valid) error(401, "bad signature");

  // Fire-and-forget sync. waitUntil keeps the Worker alive until the promise
  // resolves so the sync actually runs to completion. In environments without
  // platform context (unlikely in CF), skip silently.
  if (platform) {
    platform.context.waitUntil(syncProject(projectId, platform.env.MEDIA_BUCKET));
  }

  return json({ accepted: true }, { status: 202 });
};

// Compares X-Hub-Signature-256 against HMAC-SHA256(secret, body). Constant-time
// comparison is required: a naive string equality would leak the correct prefix
// length via timing. Uses Web Crypto (available in CF Workers + Bun).
async function verifyGithubSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  // GitHub's header is `sha256=<hex>`. Strip the prefix.
  const prefix = "sha256=";
  if (!signature.startsWith(prefix)) return false;
  const provided = signature.slice(prefix.length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = hexEncode(new Uint8Array(signed));

  return constantTimeEqual(provided, expected);
}

function hexEncode(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
