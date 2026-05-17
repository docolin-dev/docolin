import { error, fail } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import {
  docos as docosTable,
  gitSources,
  orgs,
  orgMembers,
  projects,
  syncFileErrors,
  versions,
} from "$lib/server/db/schema";
import { fromLtree } from "$lib/server/db/schema/types";
import { syncProject } from "$lib/sync/run";

// Minimal project home page. Returns 404 (not 403) for non-members of the
// org or missing projects, to avoid leaking existence.
export const load: PageServerLoad = async ({ locals, params }) => {
  const userId = locals.dbUser?.id;
  if (!userId) error(404);

  const orgRows = await db
    .select({ id: orgs.id, slug: orgs.slug, displayName: orgs.displayName })
    .from(orgs)
    .innerJoin(orgMembers, and(eq(orgMembers.orgId, orgs.id), eq(orgMembers.userId, userId)))
    .where(eq(orgs.slug, params.org))
    .limit(1);
  if (orgRows.length === 0) error(404);
  const org = orgRows[0];

  const projectRows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      displayName: projects.displayName,
      sourceMode: projects.sourceMode,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.ownerOrgId, org.id), eq(projects.slug, params.project)))
    .limit(1);
  if (projectRows.length === 0) error(404);
  const project = projectRows[0];

  // Only fetch source row when the project is git-backed; native projects
  // have no row in git_sources.
  let gitSource: {
    repoUrl: string;
    defaultBranch: string;
    subpath: string | null;
    lastSyncedAt: string | null;
    syncStatus: "idle" | "syncing" | "error";
    syncError: string | null;
  } | null = null;
  if (project.sourceMode === "git") {
    const sourceRows = await db
      .select({
        repoUrl: gitSources.repoUrl,
        defaultBranch: gitSources.defaultBranch,
        subpath: gitSources.subpath,
        lastSyncedAt: gitSources.lastSyncedAt,
        syncStatus: gitSources.syncStatus,
        syncError: gitSources.syncError,
      })
      .from(gitSources)
      .where(eq(gitSources.projectId, project.id))
      .limit(1);
    if (sourceRows.length > 0) {
      const row = sourceRows[0];
      gitSource = {
        repoUrl: row.repoUrl,
        defaultBranch: row.defaultBranch,
        subpath: row.subpath,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
        syncStatus: row.syncStatus,
        syncError: row.syncError,
      };
    }
  }

  // Per-file errors from the most recent sync. Surfaced in the UI as the
  // "files need attention" block so the owner can act on each one.
  // errorDetails is jsonb — opaque at this layer; the UI narrows it per
  // errorCode (e.g. frontmatter_invalid → list of Zod issues).
  const fileErrors = await db
    .select({
      filePath: syncFileErrors.filePath,
      errorCode: syncFileErrors.errorCode,
      errorMessage: syncFileErrors.errorMessage,
      errorDetails: syncFileErrors.errorDetails,
      syncedAt: syncFileErrors.syncedAt,
    })
    .from(syncFileErrors)
    .where(eq(syncFileErrors.projectId, project.id))
    .orderBy(asc(syncFileErrors.filePath));

  // Published docos for this project: join each doco to its latest version
  // for the title/kind/type/status we want to render. Deleted docos still
  // appear with a "removed from source" badge; the search index also keeps
  // them per spec.
  const docosList = await db
    .select({
      id: docosTable.id,
      pathInSource: docosTable.pathInSource,
      deletedAt: docosTable.deletedAt,
      title: versions.title,
      description: versions.description,
      kind: versions.kind,
      type: versions.type,
      status: versions.status,
      versionNumber: versions.versionNumber,
      commitSha: versions.commitSha,
      versionTag: versions.versionTag,
      publishedAt: versions.publishedAt,
    })
    .from(docosTable)
    .innerJoin(versions, eq(versions.id, docosTable.latestPublishedVersionId))
    .where(eq(docosTable.projectId, project.id))
    .orderBy(asc(docosTable.pathInSource));

  return {
    org: { slug: org.slug, displayName: org.displayName },
    project: {
      id: project.id,
      slug: project.slug,
      displayName: project.displayName,
      sourceMode: project.sourceMode,
      createdAt: project.createdAt.toISOString(),
    },
    gitSource,
    fileErrors: fileErrors.map((e) => ({
      filePath: e.filePath,
      errorCode: e.errorCode,
      errorMessage: e.errorMessage,
      errorDetails: e.errorDetails,
      syncedAt: e.syncedAt.toISOString(),
    })),
    docos: docosList.map((d) => ({
      id: d.id,
      pathInSource: d.pathInSource,
      deletedAt: d.deletedAt?.toISOString() ?? null,
      title: d.title,
      description: d.description,
      kind: fromLtree(d.kind),
      type: d.type,
      status: d.status,
      versionNumber: d.versionNumber,
      commitSha: d.commitSha,
      versionTag: d.versionTag,
      publishedAt: d.publishedAt.toISOString(),
    })),
  };
};

export const actions = {
  resync: async ({ locals, params, platform }) => {
    const userId = locals.dbUser?.id;
    if (!userId) return fail(401, { error: "not_authenticated" });

    // Re-verify org membership (defense in depth; layout enforces auth, not
    // org-specific permissions).
    const orgRows = await db
      .select({ id: orgs.id })
      .from(orgs)
      .innerJoin(orgMembers, and(eq(orgMembers.orgId, orgs.id), eq(orgMembers.userId, userId)))
      .where(eq(orgs.slug, params.org))
      .limit(1);
    if (orgRows.length === 0) return fail(403, { error: "not_a_member" });

    const projectRows = await db
      .select({ id: projects.id, sourceMode: projects.sourceMode })
      .from(projects)
      .where(and(eq(projects.ownerOrgId, orgRows[0].id), eq(projects.slug, params.project)))
      .limit(1);
    if (projectRows.length === 0) return fail(404, { error: "not_found" });
    if (projectRows[0].sourceMode !== "git") {
      return fail(400, { error: "not_git_project" });
    }

    if (platform) {
      platform.context.waitUntil(syncProject(projectRows[0].id, platform.env.MEDIA_BUCKET));
    }

    return { ok: true };
  },
} satisfies Actions;
