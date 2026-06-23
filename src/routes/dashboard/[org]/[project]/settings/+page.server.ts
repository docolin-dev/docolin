import { and, eq, isNull } from "drizzle-orm";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { gitSources, orgs, projects } from "$lib/server/db/schema";
import { deleteProject, renameProject } from "$lib/server/org-admin";
import { purgeCacheEverything } from "$lib/sync/cache-purge";
import { LIMITS, isRequestBodyTooLarge } from "$lib/limits";
import { localizeHref } from "$paraglide/runtime";

// Project settings: rename and delete. Org-admin only (same authority model
// as moderation); per-user SSR like the org settings page.

function fieldStr(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

// A 256-bit random secret, hex-encoded, used as the webhook HMAC key.
function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export interface WebhookInfo {
  provider: "github" | "codeberg";
  enabled: boolean;
  url: string;
  lastEventAt: string | null;
}

function buildWebhookInfo(
  source: { provider: string; secret: string | null; lastEventAt: Date | null },
  projectId: string,
  origin: string,
): WebhookInfo {
  const provider = source.provider === "gitea" ? "codeberg" : "github";
  return {
    provider,
    enabled: source.secret !== null,
    url: `${origin}/api/webhooks/${provider}/${projectId}`,
    lastEventAt: source.lastEventAt?.toISOString() ?? null,
  };
}

interface ProjectCtx {
  projectId: string;
  projectSlug: string;
  projectDisplayName: string | null;
  orgSlug: string;
}

async function adminProjectCtx(
  params: { org: string; project: string },
  locals: App.Locals,
): Promise<ProjectCtx | null> {
  if (!locals.dbUser) return null;
  const rows = await db
    .select({
      projectId: projects.id,
      projectSlug: projects.slug,
      projectDisplayName: projects.displayName,
      orgSlug: orgs.slug,
      adminUserId: orgs.adminUserId,
    })
    .from(projects)
    .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
    .where(
      and(
        eq(orgs.slug, params.org),
        isNull(orgs.deletedAt),
        eq(projects.slug, params.project),
        isNull(projects.deletedAt),
      ),
    );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!locals.dbUser.isPlatformAdmin && row.adminUserId !== locals.dbUser.id) return null;
  return row;
}

export const load: PageServerLoad = async ({ params, locals, setHeaders, url }) => {
  setHeaders({ "cache-control": "private, no-store" });
  if (!locals.dbUser) {
    const here = `/dashboard/${params.org}/${params.project}/settings`;
    redirect(303, localizeHref(`/signin?returnTo=${encodeURIComponent(here)}`));
  }
  const ctx = await adminProjectCtx(params, locals);
  // 404 (not 403) so existence doesn't leak to non-admins.
  if (ctx === null) error(404);

  // Webhook (auto-sync) state for git projects; native projects have no source.
  const sourceRows = await db
    .select({
      provider: gitSources.provider,
      secret: gitSources.webhookSecretHash,
      lastEventAt: gitSources.webhookLastEventAt,
    })
    .from(gitSources)
    .where(eq(gitSources.projectId, ctx.projectId))
    .limit(1);
  const webhook =
    sourceRows.length === 0 ? null : buildWebhookInfo(sourceRows[0], ctx.projectId, url.origin);

  return {
    project: { slug: ctx.projectSlug, displayName: ctx.projectDisplayName },
    orgSlug: ctx.orgSlug,
    webhook,
  };
};

export const actions = {
  rename: async ({ request, params, locals }) => {
    if (isRequestBodyTooLarge(request)) return fail(413, { action: "rename", error: "generic" });
    const ctx = await adminProjectCtx(params, locals);
    if (ctx === null) return fail(404, { action: "rename", error: "generic" });

    const form = await request.formData();
    const raw = fieldStr(form, "displayName").trim().slice(0, LIMITS.displayName);
    await renameProject(ctx.projectId, raw.length > 0 ? raw : null);
    return { action: "rename", ok: true };
  },

  deleteProject: async ({ request, params, locals, platform }) => {
    if (isRequestBodyTooLarge(request)) {
      return fail(413, { action: "deleteProject", error: "generic" });
    }
    const ctx = await adminProjectCtx(params, locals);
    if (ctx === null) return fail(404, { action: "deleteProject", error: "generic" });

    const form = await request.formData();
    if (fieldStr(form, "confirmSlug").trim() !== ctx.projectSlug) {
      return fail(400, { action: "deleteProject", error: "confirm_mismatch" });
    }

    await deleteProject(ctx.projectId);
    // The docos are now tombstoned (kept, not deleted), but their public pages
    // would keep serving the pre-delete version from the edge (SWR up to a
    // week); a zone purge is blunt but correct for an action this rare.
    platform?.context.waitUntil(purgeCacheEverything());
    redirect(303, localizeHref(`/dashboard/${ctx.orgSlug}`));
  },

  // Generate (or rotate) the webhook secret and turn on auto-sync. The raw secret
  // is returned once for the user to paste into the forge; it is never sent again.
  enableWebhook: async ({ request, params, locals }) => {
    if (isRequestBodyTooLarge(request)) {
      return fail(413, { action: "enableWebhook", error: "generic" });
    }
    const ctx = await adminProjectCtx(params, locals);
    if (ctx === null) return fail(404, { action: "enableWebhook", error: "generic" });

    const secret = generateSecret();
    const updated = await db
      .update(gitSources)
      .set({ webhookSecretHash: secret, updatedAt: new Date() })
      .where(eq(gitSources.projectId, ctx.projectId))
      .returning({ id: gitSources.id });
    if (updated.length === 0) {
      return fail(400, { action: "enableWebhook", error: "not_git_project" });
    }
    return { action: "enableWebhook", ok: true, secret };
  },

  disableWebhook: async ({ request, params, locals }) => {
    if (isRequestBodyTooLarge(request)) {
      return fail(413, { action: "disableWebhook", error: "generic" });
    }
    const ctx = await adminProjectCtx(params, locals);
    if (ctx === null) return fail(404, { action: "disableWebhook", error: "generic" });

    await db
      .update(gitSources)
      .set({ webhookSecretHash: null, webhookLastEventAt: null, updatedAt: new Date() })
      .where(eq(gitSources.projectId, ctx.projectId));
    return { action: "disableWebhook", ok: true };
  },
} satisfies Actions;
