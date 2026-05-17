import { and, eq, ne } from "drizzle-orm";
import { db } from "$lib/server/db";
import { claimRequests, inboxMessages, orgs, orgMembers } from "$lib/server/db/schema";
import type { DbOrg } from "./users";

// Admin actions on pre-reserved-name claims. Both run as a single transaction
// so a partial state (e.g. org created but claim status not updated) can't
// happen. The cascade-cancel on approve enforces the schema's "one approval
// per slug" rule and queues claim_cancelled inbox messages for the rejected
// claimants so they know what happened next time the inbox UI ships.

export type ApproveClaimResult =
  | { ok: true; org: DbOrg; cancelledCount: number }
  | { ok: false; reason: "not_found" | "not_pending" | "slug_taken" | "provision_failed" };

export async function approveClaim({
  uid,
  adminUserId,
  notes,
}: {
  uid: string;
  adminUserId: string;
  notes: string | null;
}): Promise<ApproveClaimResult> {
  try {
    return await db.transaction(async (tx) => {
      const claimRows = await tx
        .select()
        .from(claimRequests)
        .where(eq(claimRequests.uid, uid))
        .limit(1);
      if (claimRows.length === 0) return { ok: false, reason: "not_found" } as const;
      const claim = claimRows[0];
      if (claim.status !== "pending") return { ok: false, reason: "not_pending" } as const;

      const takenRows = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.slug, claim.requestedSlug))
        .limit(1);
      if (takenRows.length > 0) return { ok: false, reason: "slug_taken" } as const;

      const insertedRows = await tx
        .insert(orgs)
        .values({
          slug: claim.requestedSlug,
          displayName: claim.requestedDisplayName,
          adminUserId: claim.requestedByUserId,
          foundedByUserId: claim.requestedByUserId,
        })
        .returning();
      const insertedOrg = insertedRows[0];

      await tx.insert(orgMembers).values({
        orgId: insertedOrg.id,
        userId: claim.requestedByUserId,
      });

      const now = new Date();

      await tx
        .update(claimRequests)
        .set({
          status: "approved",
          resolvedByUserId: adminUserId,
          resolvedAt: now,
          resolutionNotes: notes,
          updatedAt: now,
        })
        .where(eq(claimRequests.id, claim.id));

      const cancelled = await tx
        .update(claimRequests)
        .set({
          status: "cancelled",
          resolvedByUserId: adminUserId,
          resolvedAt: now,
          resolutionNotes: "Slug was approved for another claimant.",
          updatedAt: now,
        })
        .where(
          and(
            eq(claimRequests.requestedSlug, claim.requestedSlug),
            eq(claimRequests.status, "pending"),
            ne(claimRequests.id, claim.id),
          ),
        )
        .returning({
          id: claimRequests.id,
          uid: claimRequests.uid,
          userId: claimRequests.requestedByUserId,
        });

      await tx.insert(inboxMessages).values({
        userId: claim.requestedByUserId,
        kind: "claim_approved",
        subject: `Your claim for ${claim.requestedSlug} was approved`,
        preview: `Your org is live. Open it to set up details and create your first project.`,
        bodyMarkdown: `Your org is now live and ready to use.

:::btn
[Open the org](/dashboard/${claim.requestedSlug})
:::

**What's next**

- Set the org display name and description in settings
- Invite teammates as members
- Create your first project to start publishing docs

Reference: \`${claim.uid}\``,
        linkUrl: `/dashboard/${claim.requestedSlug}`,
        relatedRecordId: claim.id,
      });

      if (cancelled.length > 0) {
        await tx.insert(inboxMessages).values(
          cancelled.map((sib) => {
            const supportSubject = encodeURIComponent(
              `[claim-dispute] ${claim.requestedSlug} (${sib.uid})`,
            );
            const supportBody = encodeURIComponent(
              `Hi docolin team,\n\nI'd like to follow up on my cancelled claim for the slug "${claim.requestedSlug}".\n\nReference id: ${sib.uid}\n\n[Explain why you believe the wrong claimant was approved, and what authority you have over this brand]\n\nThanks`,
            );
            const supportMailto = `mailto:support@docolin.dev?subject=${supportSubject}&body=${supportBody}`;
            return {
              userId: sib.userId,
              kind: "claim_cancelled" as const,
              subject: `Your claim for ${claim.requestedSlug} was cancelled`,
              preview: `Another claimant was verified for this slug. You can pick a different one or appeal.`,
              bodyMarkdown: `Another claimant was verified for this slug first, which automatically cancels your claim.

:::info
Multiple users had pending claims for the same brand. We verified the other claimant first.
:::

**What you can do**

- [File a different slug](/dashboard/orgs/new) for your org
- Email [support@docolin.dev](${supportMailto}) if you believe the wrong claimant was approved`,
              relatedRecordId: sib.id,
            };
          }),
        );
      }

      return {
        ok: true as const,
        org: insertedOrg,
        cancelledCount: cancelled.length,
      };
    });
  } catch (err) {
    console.error("approveClaim failed", err);
    return { ok: false, reason: "provision_failed" };
  }
}

export type CancelClaimResult = { ok: true } | { ok: false; reason: "not_found" | "not_pending" };

export async function cancelClaim({
  uid,
  adminUserId,
  notes,
}: {
  uid: string;
  adminUserId: string;
  notes: string;
}): Promise<CancelClaimResult> {
  return db.transaction(async (tx) => {
    const claimRows = await tx
      .select()
      .from(claimRequests)
      .where(eq(claimRequests.uid, uid))
      .limit(1);
    if (claimRows.length === 0) return { ok: false, reason: "not_found" } as const;
    const claim = claimRows[0];
    if (claim.status !== "pending") return { ok: false, reason: "not_pending" } as const;

    const now = new Date();

    await tx
      .update(claimRequests)
      .set({
        status: "cancelled",
        resolvedByUserId: adminUserId,
        resolvedAt: now,
        resolutionNotes: notes,
        updatedAt: now,
      })
      .where(eq(claimRequests.id, claim.id));

    const supportSubject = encodeURIComponent(
      `[claim-dispute] ${claim.requestedSlug} (${claim.uid})`,
    );
    const supportBody = encodeURIComponent(
      `Hi docolin team,\n\nI'd like to appeal the decision on my claim for "${claim.requestedSlug}".\n\nReference id: ${claim.uid}\n\n[Explain why you believe this was a misunderstanding, and what authority you have over this brand]\n\nThanks`,
    );
    const supportMailto = `mailto:support@docolin.dev?subject=${supportSubject}&body=${supportBody}`;

    await tx.insert(inboxMessages).values({
      userId: claim.requestedByUserId,
      kind: "claim_cancelled",
      subject: `Your claim for ${claim.requestedSlug} was declined`,
      preview: `Reviewed and declined. Check the reason and recourse options.`,
      bodyMarkdown: `The review concluded with a decline.

:::warning
**Reason from review**

${notes}
:::

**What you can do**

- [File a different slug](/dashboard/orgs/new) for your org
- Email [support@docolin.dev](${supportMailto}) with reference \`${claim.uid}\` if this was a misunderstanding`,
      relatedRecordId: claim.id,
    });

    return { ok: true as const };
  });
}
