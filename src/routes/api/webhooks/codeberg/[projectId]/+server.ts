import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { gitSources } from "$lib/server/db/schema";
import { syncProject } from "$lib/sync/run";

// Codeberg (Forgejo) webhook receiver, the sibling of the GitHub one. Forgejo
// signs the raw body with HMAC-SHA256 in the X-Forgejo-Signature header (bare
// hex, no "sha256=" prefix); older Gitea-compatible senders use
// X-Gitea-Signature. Same opt-in model: projects without a stored secret 404.

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
    // "bad signature"; matches the GitHub receiver.
    error(404, "webhook not configured");
  }

  const signature =
    request.headers.get("x-forgejo-signature") ?? request.headers.get("x-gitea-signature");
  if (signature === null) error(401, "missing signature");

  const body = await request.text();
  const valid = await verifyForgejoSignature(body, signature, source[0].webhookSecretHash);
  if (!valid) error(401, "bad signature");

  if (platform) {
    platform.context.waitUntil(syncProject(projectId, platform.env.MEDIA_BUCKET));
  }

  return json({ accepted: true }, { status: 202 });
};

async function verifyForgejoSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = hexEncode(new Uint8Array(signed));
  return constantTimeEqual(signature.toLowerCase(), expected);
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
