import { error, json } from "@sveltejs/kit";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { RequestHandler } from "./$types";
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

// Per-user data for /dashboard/[org]/[project]. The page polls this endpoint
// every few seconds while a sync is running, so the response sets the sync
// status in real-time. Membership-gated; 404 (not 403) for non-members to
// avoid leaking project existence.
export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
  const userId = locals.dbUser?.id;
  if (!userId) error(401, "not_authenticated");

  setHeaders({ "cache-control": "private, no-store" });

  const orgRows = await db
    .select({ id: orgs.id, slug: orgs.slug, displayName: orgs.displayName })
    .from(orgs)
    .innerJoin(orgMembers, and(eq(orgMembers.orgId, orgs.id), eq(orgMembers.userId, userId)))
    .where(and(eq(orgs.slug, params.org), isNull(orgs.deletedAt)))
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
    .where(
      and(
        eq(projects.ownerOrgId, org.id),
        eq(projects.slug, params.project),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (projectRows.length === 0) error(404);
  const project = projectRows[0];

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

  return json({
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
  });
};
