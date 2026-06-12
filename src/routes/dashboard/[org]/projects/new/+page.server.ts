import { fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { localizeHref } from "$paraglide/runtime";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { gitSources, orgs, orgMembers, projects } from "$lib/server/db/schema";
import { checkProjectSlugAvailability } from "$lib/reserved-handles";
import { verifyForgeRepo } from "$lib/server/repo-check";
import { syncProject } from "$lib/sync/run";
import { LIMITS } from "$lib/limits";

const MAX_SUBPATH = 200;

// Edge-cacheable shell. Membership is re-verified inside the create action
// (defense in depth); the page UI uses the org slug from the URL params and
// doesn't need server-loaded org info. One cached HTML per org slug.
export const load: PageServerLoad = ({ setHeaders, isDataRequest }) => {
  setHeaders({
    "cache-control": isDataRequest
      ? "private, no-store"
      : "public, max-age=300, s-maxage=2592000, stale-while-revalidate=604800",
  });
  return {};
};

export const actions = {
  default: async ({ request, params, locals, platform }) => {
    const userId = locals.dbUser?.id;
    if (!userId) return fail(401, { error: "not_authenticated" });

    // Re-verify membership in the action too (defense in depth; layout
    // guards auth but doesn't enforce org-specific membership).
    const orgRows = await db
      .select({ id: orgs.id })
      .from(orgs)
      .innerJoin(orgMembers, and(eq(orgMembers.orgId, orgs.id), eq(orgMembers.userId, userId)))
      .where(eq(orgs.slug, params.org))
      .limit(1);
    if (orgRows.length === 0) return fail(403, { error: "not_a_member" });
    const orgId = orgRows[0].id;

    const form = await request.formData();
    const rawSourceMode = form.get("sourceMode");
    const rawSlug = form.get("slug");
    const rawDisplayName = form.get("displayName");
    const rawRepoUrl = form.get("repoUrl");
    const rawSubpath = form.get("subpath");

    const sourceMode: "git" | "native" = rawSourceMode === "native" ? "native" : "git";
    const slug = typeof rawSlug === "string" ? rawSlug.trim().toLowerCase() : "";
    const displayNameRaw =
      typeof rawDisplayName === "string" ? rawDisplayName.trim().slice(0, LIMITS.displayName) : "";
    const displayName = displayNameRaw.length > 0 ? displayNameRaw : null;
    const repoUrlRaw = typeof rawRepoUrl === "string" ? rawRepoUrl.trim() : "";
    const subpathRaw =
      typeof rawSubpath === "string" ? rawSubpath.trim().slice(0, MAX_SUBPATH) : "";
    const subpath = subpathRaw.length > 0 ? subpathRaw : null;

    const shapeCheck = checkProjectSlugAvailability(slug);
    if (!shapeCheck.ok) {
      return fail(400, {
        error: shapeCheck.reason,
        sourceMode,
        slug,
        displayName: displayNameRaw,
        repoUrl: repoUrlRaw,
        subpath: subpathRaw,
      });
    }

    const taken = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.ownerOrgId, orgId), eq(projects.slug, slug)))
      .limit(1);
    if (taken.length > 0) {
      return fail(409, {
        error: "slug_taken",
        sourceMode,
        slug,
        displayName: displayNameRaw,
        repoUrl: repoUrlRaw,
        subpath: subpathRaw,
      });
    }

    if (sourceMode === "git") {
      const repoCheck = await verifyForgeRepo(repoUrlRaw);
      if (!repoCheck.ok) {
        return fail(400, {
          error: repoCheck.reason,
          sourceMode,
          slug,
          displayName: displayNameRaw,
          repoUrl: repoUrlRaw,
          subpath: subpathRaw,
        });
      }

      let createdProjectId: string;
      try {
        createdProjectId = await db.transaction(async (tx) => {
          const insertedProject = await tx
            .insert(projects)
            .values({
              ownerOrgId: orgId,
              slug,
              displayName,
              sourceMode: "git",
            })
            .returning({ id: projects.id });
          const newId = insertedProject[0].id;
          await tx.insert(gitSources).values({
            projectId: newId,
            provider: repoCheck.provider,
            repoUrl: repoCheck.canonicalUrl,
            defaultBranch: repoCheck.defaultBranch,
            subpath,
          });
          return newId;
        });
      } catch (err) {
        console.error("project provision (git) failed", err);
        return fail(500, {
          error: "provision_failed",
          sourceMode,
          slug,
          displayName: displayNameRaw,
          repoUrl: repoUrlRaw,
          subpath: subpathRaw,
        });
      }

      // Fire the initial sync as a fire-and-forget background job. The user
      // gets the redirect immediately and the project page polls for the
      // sync_status badge. waitUntil keeps the Worker alive past the response
      // until the sync resolves. Skip silently in environments where the
      // platform context isn't available (some dev setups).
      if (platform) {
        platform.context.waitUntil(syncProject(createdProjectId, platform.env.MEDIA_BUCKET));
      }
    } else {
      try {
        await db.insert(projects).values({
          ownerOrgId: orgId,
          slug,
          displayName,
          sourceMode: "native",
        });
      } catch (err) {
        console.error("project provision (native) failed", err);
        return fail(500, {
          error: "provision_failed",
          sourceMode,
          slug,
          displayName: displayNameRaw,
          repoUrl: repoUrlRaw,
          subpath: subpathRaw,
        });
      }
    }

    redirect(303, localizeHref(`/dashboard/${params.org}/${slug}`));
  },
} satisfies Actions;
