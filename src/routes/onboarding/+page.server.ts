import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { checkHandleAvailability } from "$lib/reserved-handles";
import { provisionUser } from "$lib/server/onboarding";
import { localizeHref } from "$paraglide/runtime";
import { LIMITS } from "$lib/limits";

// Derive a sensible default handle from the user's email's local part. Strip
// disallowed characters, fall back to "user" if nothing usable is left.
function deriveHandleFromEmail(email: string | null): string {
  if (!email) return "";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  let out = "";
  let lastWasDash = false;
  for (const c of local) {
    const isAlnum = (c >= "a" && c <= "z") || (c >= "0" && c <= "9");
    const isDash = c === "-";
    if (isAlnum) {
      out += c;
      lastWasDash = false;
    } else if (isDash && !lastWasDash && out.length > 0) {
      out += c;
      lastWasDash = true;
    }
  }
  while (out.endsWith("-")) out = out.slice(0, -1);
  return out;
}

function deriveDisplayName(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
): string {
  const parts = [firstName, lastName].filter((p): p is string => Boolean(p && p.length > 0));
  if (parts.length > 0) return parts.join(" ");
  if (email) return email.split("@")[0] ?? "";
  return "";
}

export const load: PageServerLoad = ({ locals, url, setHeaders }) => {
  if (!locals.auth.user) {
    redirect(302, localizeHref(`/signin?returnTo=/onboarding${url.search}`));
  }
  if (locals.dbUser) {
    redirect(302, url.searchParams.get("returnTo") ?? localizeHref("/"));
  }
  // Suggested handle / displayName come from the WorkOS user record; per-user
  // and one-time. Never cache.
  setHeaders({ "cache-control": "private, no-store" });
  return {
    suggestedHandle: deriveHandleFromEmail(locals.auth.user.email),
    suggestedDisplayName: deriveDisplayName(
      locals.auth.user.firstName,
      locals.auth.user.lastName,
      locals.auth.user.email,
    ),
  };
};

export const actions = {
  default: async ({ request, locals, url }) => {
    const form = await request.formData();
    const rawHandle = form.get("handle");
    const rawDisplayName = form.get("displayName");

    const handle = typeof rawHandle === "string" ? rawHandle.trim().toLowerCase() : "";
    const displayNameRaw =
      typeof rawDisplayName === "string" ? rawDisplayName.trim().slice(0, LIMITS.displayName) : "";
    const displayName = displayNameRaw.length > 0 ? displayNameRaw : null;

    if (!locals.auth.user) {
      return fail(401, { error: "not_authenticated", handle, displayName: displayNameRaw });
    }
    if (locals.dbUser) {
      // Already onboarded; just bounce them to where they wanted to go.
      redirect(303, url.searchParams.get("returnTo") ?? localizeHref("/"));
    }

    const shapeCheck = checkHandleAvailability(handle);
    if (!shapeCheck.ok) {
      return fail(400, {
        error: shapeCheck.reason,
        handle,
        displayName: displayNameRaw,
      });
    }

    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, handle))
      .limit(1);
    if (taken.length > 0) {
      return fail(409, { error: "taken", handle, displayName: displayNameRaw });
    }

    try {
      await provisionUser({
        workosUserId: locals.auth.user.id,
        handle,
        displayName,
        email: locals.auth.user.email,
      });
    } catch (err) {
      // Most likely a unique-constraint violation from a race with another
      // request grabbing the same handle in the gap between check and insert.
      console.error("provisionUser failed", err);
      return fail(500, { error: "provision_failed", handle, displayName: displayNameRaw });
    }

    redirect(303, url.searchParams.get("returnTo") ?? localizeHref("/dashboard"));
  },
} satisfies Actions;
