import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { checkHandleAvailability } from "$lib/reserved-handles";

// Live availability check called from the onboarding handle picker as the
// user types (debounced client-side). Returns a typed status enum the client
// maps to localized helper text. Treats all reserved categories as "not
// usable for a personal handle" since the user-handle step doesn't run the
// claim flow.
export const GET: RequestHandler = async ({ url }) => {
  const raw = url.searchParams.get("h") ?? "";
  const handle = raw.trim().toLowerCase();

  const shapeCheck = checkHandleAvailability(handle);
  if (!shapeCheck.ok) {
    return json({ ok: false, reason: shapeCheck.reason });
  }

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  if (rows.length > 0) {
    return json({ ok: false, reason: "taken" });
  }

  return json({ ok: true });
};
