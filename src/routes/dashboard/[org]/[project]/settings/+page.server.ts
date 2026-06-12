import { and, eq } from "drizzle-orm";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { orgs, projects } from "$lib/server/db/schema";
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
    .where(and(eq(orgs.slug, params.org), eq(projects.slug, params.project)));
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!locals.dbUser.isPlatformAdmin && row.adminUserId !== locals.dbUser.id) return null;
  return row;
}

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
  setHeaders({ "cache-control": "private, no-store" });
  if (!locals.dbUser) {
    const here = `/dashboard/${params.org}/${params.project}/settings`;
    redirect(303, localizeHref(`/signin?returnTo=${encodeURIComponent(here)}`));
  }
  const ctx = await adminProjectCtx(params, locals);
  // 404 (not 403) so existence doesn't leak to non-admins.
  if (ctx === null) error(404);
  return {
    project: { slug: ctx.projectSlug, displayName: ctx.projectDisplayName },
    orgSlug: ctx.orgSlug,
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
    const ctx = await adminProjectCtx(params, locals);
    if (ctx === null) return fail(404, { action: "deleteProject", error: "generic" });

    const form = await request.formData();
    if (fieldStr(form, "confirmSlug").trim() !== ctx.projectSlug) {
      return fail(400, { action: "deleteProject", error: "confirm_mismatch" });
    }

    await deleteProject(ctx.projectId);
    // The project's public pages would keep serving from the edge (SWR up to
    // a week) after the rows are gone; a zone purge is blunt but correct for
    // an action this rare.
    platform?.context.waitUntil(purgeCacheEverything());
    redirect(303, localizeHref(`/dashboard/${ctx.orgSlug}`));
  },
} satisfies Actions;
