import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { gitSources } from "$lib/server/db/schema";
import { pushedDefaultBranch } from "$lib/server/webhooks/shared";
import { enqueueSync } from "$lib/sync/job";

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
      defaultBranch: gitSources.defaultBranch,
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

  // Only a push to the project's default branch syncs.
  const event = request.headers.get("x-forgejo-event") ?? request.headers.get("x-gitea-event");
  if (event !== "push") return json({ ignored: "not a push event" }, { status: 202 });
  if (!pushedDefaultBranch(body, source[0].defaultBranch)) {
    return json({ ignored: "not the default branch" }, { status: 202 });
  }

  // Accepted push to the default branch: record it for the "last push received"
  // affordance (only a real push, not a test or other-branch delivery).
  await db
    .update(gitSources)
    .set({ webhookLastEventAt: new Date(), updatedAt: new Date() })
    .where(eq(gitSources.id, source[0].id));

  // Enqueue a sync and kick the drain. The chunked job survives a large diff
  // where the old fire-and-forget waitUntil sync would have evicted.
  if (platform) {
    await enqueueSync(projectId, {
      queue: platform.env.SYNC_QUEUE,
      bucket: platform.env.MEDIA_BUCKET,
    });
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
