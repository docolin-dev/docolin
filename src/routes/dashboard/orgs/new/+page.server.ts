import { randomUUID } from "node:crypto";
import { fail, redirect } from "@sveltejs/kit";
import { localizeHref } from "$paraglide/runtime";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { claimRequests, orgs } from "$lib/server/db/schema";
import { checkHandleAvailability } from "$lib/reserved-handles";
import { provisionOrg } from "$lib/server/onboarding";
import { LIMITS } from "$lib/limits";

// Edge-cacheable shell. The form is static (the user's handle, if needed for
// any UI affordance, is available via the client-side session store), and
// the create action runs server-side on submit.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=300, s-maxage=2592000, stale-while-revalidate=604800",
  });
  return {};
};

// Build a short human-readable UID for a claim. Prefix `clm-` + first 12 hex
// chars of a randomUUID. ~10^14 keyspace, collision is effectively impossible
// at our scale. claim_requests.uid has a unique index so a conflict would
// surface as an insert error and the user can retry.
function generateClaimUid(): string {
  return `clm-${randomUUID().split("-").join("").slice(0, 12)}`;
}

export const actions = {
  default: async ({ request, locals }) => {
    if (!locals.auth.user || !locals.dbUser) {
      return fail(401, { error: "not_authenticated" });
    }

    const form = await request.formData();
    const rawSlug = form.get("handle");
    const rawDisplayName = form.get("displayName");
    const rawDetails = form.get("details");

    const slug = typeof rawSlug === "string" ? rawSlug.trim().toLowerCase() : "";
    const displayNameRaw =
      typeof rawDisplayName === "string" ? rawDisplayName.trim().slice(0, LIMITS.displayName) : "";
    const displayName = displayNameRaw.length > 0 ? displayNameRaw : null;
    const claimDetails =
      typeof rawDetails === "string" && rawDetails.trim().length > 0
        ? rawDetails.trim().slice(0, 1000)
        : null;

    const shapeCheck = checkHandleAvailability(slug);

    // Pre-reserved slug: file a claim_request instead of creating the org.
    // The user keeps their personal org and gets a UID to quote in support
    // email. Admin approves later, which creates the actual org row.
    if (!shapeCheck.ok && shapeCheck.reason === "reserved_prereserved") {
      const uid = generateClaimUid();
      try {
        const [inserted] = await db
          .insert(claimRequests)
          .values({
            uid,
            requestedSlug: slug,
            requestedDisplayName: displayName,
            requestedByUserId: locals.dbUser.id,
            details: claimDetails,
          })
          .returning();
        redirect(303, localizeHref(`/dashboard/claims/${inserted.uid}`));
      } catch (err) {
        // Re-throw redirect; only DB errors land here.
        if (err && typeof err === "object" && "status" in err && "location" in err) {
          throw err;
        }
        console.error("claim_request insert failed", err);
        return fail(500, {
          error: "claim_failed",
          handle: slug,
          displayName: displayNameRaw,
          details: claimDetails ?? "",
        });
      }
    }

    if (!shapeCheck.ok) {
      return fail(400, {
        error: shapeCheck.reason,
        handle: slug,
        displayName: displayNameRaw,
      });
    }

    const taken = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
    if (taken.length > 0) {
      return fail(409, { error: "taken", handle: slug, displayName: displayNameRaw });
    }

    try {
      await provisionOrg({
        founderUserId: locals.dbUser.id,
        slug,
        displayName,
      });
    } catch (err) {
      // Most likely a unique-constraint race between the availability check
      // and insert. Surface a generic friendly error and let the user retry.
      console.error("provisionOrg failed", err);
      return fail(500, { error: "provision_failed", handle: slug, displayName: displayNameRaw });
    }

    redirect(303, localizeHref(`/dashboard/${slug}`));
  },
} satisfies Actions;
