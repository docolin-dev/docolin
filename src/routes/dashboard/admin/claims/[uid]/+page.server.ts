import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq, ne } from "drizzle-orm";
import { localizeHref } from "$paraglide/runtime";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { claimRequests, users } from "$lib/server/db/schema";
import { approveClaim, cancelClaim } from "$lib/server/claims";

export const load: PageServerLoad = async ({ params }) => {
  const rows = await db
    .select({
      uid: claimRequests.uid,
      slug: claimRequests.requestedSlug,
      requestedDisplayName: claimRequests.requestedDisplayName,
      details: claimRequests.details,
      status: claimRequests.status,
      createdAt: claimRequests.createdAt,
      requesterHandle: users.handle,
      requesterDisplayName: users.displayName,
      requesterEmail: users.email,
    })
    .from(claimRequests)
    .innerJoin(users, eq(users.id, claimRequests.requestedByUserId))
    .where(eq(claimRequests.uid, params.uid))
    .limit(1);
  if (rows.length === 0) error(404);
  const row = rows[0];

  // Sibling pending claims (same slug, different uid). Surfaced so the admin
  // knows what they're about to cascade-cancel by approving this one.
  const siblings = await db
    .select({
      uid: claimRequests.uid,
      requesterHandle: users.handle,
      requesterEmail: users.email,
    })
    .from(claimRequests)
    .innerJoin(users, eq(users.id, claimRequests.requestedByUserId))
    .where(
      and(
        eq(claimRequests.requestedSlug, row.slug),
        eq(claimRequests.status, "pending"),
        ne(claimRequests.uid, row.uid),
      ),
    );

  return {
    claim: {
      uid: row.uid,
      slug: row.slug,
      requestedDisplayName: row.requestedDisplayName,
      details: row.details,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      requester: {
        handle: row.requesterHandle,
        displayName: row.requesterDisplayName,
        email: row.requesterEmail,
      },
    },
    siblings: siblings.map((s) => ({
      uid: s.uid,
      handle: s.requesterHandle,
      email: s.requesterEmail,
    })),
  };
};

export const actions = {
  approve: async ({ params, request, locals }) => {
    if (!locals.dbUser?.isPlatformAdmin) return fail(403, { error: "forbidden" });
    const form = await request.formData();
    const raw = form.get("notes");
    const notes = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

    const result = await approveClaim({
      uid: params.uid,
      adminUserId: locals.dbUser.id,
      notes,
    });
    if (!result.ok) return fail(400, { error: result.reason });
    redirect(303, localizeHref("/dashboard/admin/claims"));
  },

  cancel: async ({ params, request, locals }) => {
    if (!locals.dbUser?.isPlatformAdmin) return fail(403, { error: "forbidden" });
    const form = await request.formData();
    const raw = form.get("notes");
    const notes = typeof raw === "string" ? raw.trim() : "";
    if (notes.length === 0) return fail(400, { error: "notes_required" });

    const result = await cancelClaim({
      uid: params.uid,
      adminUserId: locals.dbUser.id,
      notes,
    });
    if (!result.ok) return fail(400, { error: result.reason });
    redirect(303, localizeHref("/dashboard/admin/claims"));
  },
} satisfies Actions;
