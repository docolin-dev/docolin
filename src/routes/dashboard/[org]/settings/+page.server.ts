import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  type OrgAdminView,
  addOrgMember,
  deleteOrg,
  getOrgAdminView,
  isOrgMember,
  listOrgMembers,
  removeOrgMember,
  renameOrg,
} from "$lib/server/org-admin";
import { LIMITS, isRequestBodyTooLarge } from "$lib/limits";
import { localizeHref } from "$paraglide/runtime";

// Org settings: rename, members, delete. Members can view and leave; only the
// org admin (or platform staff) mutates. Small admin audience, so this is the
// documented exception to the cached-shell pattern: plain per-user SSR.

function fieldStr(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

interface Viewer {
  id: string;
  isPlatformAdmin: boolean;
}

function canAdmin(org: { adminUserId: string }, viewer: Viewer): boolean {
  return viewer.isPlatformAdmin || org.adminUserId === viewer.id;
}

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
  setHeaders({ "cache-control": "private, no-store" });
  if (!locals.dbUser) {
    redirect(
      303,
      localizeHref(`/signin?returnTo=${encodeURIComponent(`/dashboard/${params.org}/settings`)}`),
    );
  }

  const org = await getOrgAdminView(params.org);
  if (org === null) error(404);
  const viewer: Viewer = { id: locals.dbUser.id, isPlatformAdmin: locals.dbUser.isPlatformAdmin };
  const member = await isOrgMember(org.id, viewer.id);
  // Membership-gated 404 (not 403) so org existence doesn't leak, matching
  // the dashboard API routes.
  if (!member && !viewer.isPlatformAdmin) error(404);

  return {
    org: {
      slug: org.slug,
      displayName: org.displayName,
      projectCount: org.projectCount,
      isPersonal: org.isPersonal,
    },
    members: await listOrgMembers(org.id, org.adminUserId),
    viewerIsAdmin: canAdmin(org, viewer),
    viewerId: viewer.id,
  };
};

interface ActionContext {
  org: OrgAdminView;
  viewer: Viewer;
  isAdmin: boolean;
}

// Shared action preamble: signed-in viewer + org + admin flag, or null.
async function actionContext(
  params: { org: string },
  locals: App.Locals,
): Promise<ActionContext | null> {
  if (!locals.dbUser) return null;
  const org = await getOrgAdminView(params.org);
  if (org === null) return null;
  const viewer: Viewer = { id: locals.dbUser.id, isPlatformAdmin: locals.dbUser.isPlatformAdmin };
  return { org, viewer, isAdmin: canAdmin(org, viewer) };
}

export const actions = {
  rename: async ({ request, params, locals }) => {
    if (isRequestBodyTooLarge(request)) return fail(413, { action: "rename", error: "generic" });
    const ctx = await actionContext(params, locals);
    if (ctx === null) return fail(404, { action: "rename", error: "generic" });
    if (!ctx.isAdmin) return fail(403, { action: "rename", error: "forbidden" });

    const form = await request.formData();
    const raw = fieldStr(form, "displayName").trim().slice(0, LIMITS.displayName);
    await renameOrg(ctx.org.id, raw.length > 0 ? raw : null);
    return { action: "rename", ok: true };
  },

  addMember: async ({ request, params, locals }) => {
    if (isRequestBodyTooLarge(request)) return fail(413, { action: "addMember", error: "generic" });
    const ctx = await actionContext(params, locals);
    if (ctx === null) return fail(404, { action: "addMember", error: "generic" });
    if (!ctx.isAdmin) return fail(403, { action: "addMember", error: "forbidden" });

    const form = await request.formData();
    const handle = fieldStr(form, "handle").trim().replace("@", "").toLowerCase();
    if (handle.length === 0) return fail(400, { action: "addMember", error: "handle_required" });

    const res = await addOrgMember(ctx.org, handle);
    if (!res.ok) return fail(400, { action: "addMember", error: res.reason, handle });
    return { action: "addMember", ok: true };
  },

  removeMember: async ({ request, params, locals }) => {
    const ctx = await actionContext(params, locals);
    if (ctx === null) return fail(404, { action: "removeMember", error: "generic" });
    if (!ctx.isAdmin) return fail(403, { action: "removeMember", error: "forbidden" });

    const form = await request.formData();
    const userId = fieldStr(form, "userId");
    if (userId.length === 0) return fail(400, { action: "removeMember", error: "generic" });

    const res = await removeOrgMember(ctx.org, userId);
    if (!res.ok) return fail(400, { action: "removeMember", error: res.reason });
    return { action: "removeMember", ok: true };
  },

  leave: async ({ params, locals }) => {
    const ctx = await actionContext(params, locals);
    if (ctx === null) return fail(404, { action: "leave", error: "generic" });

    const res = await removeOrgMember(ctx.org, ctx.viewer.id);
    if (!res.ok) return fail(400, { action: "leave", error: res.reason });
    redirect(303, localizeHref("/dashboard"));
  },

  deleteOrg: async ({ request, params, locals }) => {
    const ctx = await actionContext(params, locals);
    if (ctx === null) return fail(404, { action: "deleteOrg", error: "generic" });
    if (!ctx.isAdmin) return fail(403, { action: "deleteOrg", error: "forbidden" });

    const form = await request.formData();
    // Type-to-confirm: the slug, not a generic "yes".
    if (fieldStr(form, "confirmSlug").trim() !== ctx.org.slug) {
      return fail(400, { action: "deleteOrg", error: "confirm_mismatch" });
    }

    const res = await deleteOrg(ctx.org);
    if (!res.ok) return fail(400, { action: "deleteOrg", error: res.reason });
    redirect(303, localizeHref("/dashboard"));
  },
} satisfies Actions;
