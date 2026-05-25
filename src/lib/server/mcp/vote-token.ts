import { requireEnv } from "$lib/server/env";

// One-time vote tokens. A token is a stateless, HMAC-signed binding of a doco
// version + a random nonce + an expiry, handed out in an MCP fetch result (and
// the /verify link). It's tamper-proof (the agent can't change which version it
// verifies) and single-use (the nonce lands on the stamp under a unique index,
// so a second redemption is a no-op). Signing reuses the cookie secret with a
// domain-separation prefix, so no extra env var is needed; swap in a dedicated
// VOTE_TOKEN_SECRET later if you want key isolation.
//
// Kept short (~65 chars) so an agent can copy it verbatim from fetch into verify
// without truncation: the version UUID is packed to base64url, the nonce is 8
// bytes, the expiry is base36, and the HMAC is truncated to 128 bits.

const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days; verifications can lag a fetch.
const DOMAIN = "docolin-vote-token:v1:";
// HMAC-SHA256 truncated to 128 bits: ample for a short-lived, single-use,
// low-stakes token, and forging a 128-bit MAC is infeasible.
const SIG_BYTES = 16;

let keyPromise: Promise<CryptoKey> | null = null;
function hmacKey(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireEnv("WORKOS_COOKIE_PASSWORD")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return keyPromise;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64urlToBytes(value: string): Uint8Array {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll("-", "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  const full = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(DOMAIN + payload));
  return bytesToBase64url(new Uint8Array(full).slice(0, SIG_BYTES));
}

// Constant-time string compare, so a forged signature can't be brute-forced byte
// by byte off response timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signVoteToken(versionId: string): Promise<string> {
  const nonceBytes = new Uint8Array(8);
  crypto.getRandomValues(nonceBytes);
  const nonce = bytesToBase64url(nonceBytes);
  const vid = bytesToBase64url(uuidToBytes(versionId));
  const exp = (Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS).toString(36);
  const payload = `${vid}.${nonce}.${exp}`;
  return `${payload}.${await sign(payload)}`;
}

export interface VoteTokenClaims {
  versionId: string;
  nonce: string;
}

/** Validates a vote token's signature + expiry, returning its claims or null. */
export async function verifyVoteToken(token: string): Promise<VoteTokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [vid, nonce, expStr, sig] = parts;
  // Verify the signature before decoding anything, so a malformed/forged token
  // is rejected here (and the decode below only runs on input we produced).
  if (!timingSafeEqual(sig, await sign(`${vid}.${nonce}.${expStr}`))) return null;
  const exp = Number.parseInt(expStr, 36);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const vidBytes = base64urlToBytes(vid);
  if (vidBytes.length !== 16) return null;
  return { versionId: bytesToUuid(vidBytes), nonce };
}
