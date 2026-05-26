import { and, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { docos as docosTable, gitSources, orgs, projects, versions } from "$lib/server/db/schema";
import { fromLtree } from "$lib/server/db/schema/types";
import { stripDocExtension } from "$lib/doco-urls";

// Shared (org, project) and doco-identity resolution. The public doco viewer
// and the discussions routes both need to turn an `/{org}/{project}/{path}`
// URL into a project + doco row, so the lookups live here once instead of
// being duplicated per route.

// A git-backed project resolved from its (org-slug, project-slug) URL pair.
// Native projects (no git_source row) don't resolve here; callers treat a
// null result as a 404 until native rendering ships.
export interface ResolvedProject {
  orgSlug: string;
  orgDisplayName: string | null;
  ownerOrgId: string;
  // Org admin, denormalized here so discussion moderation can decide
  // canModerate without a second query (admin OR platform-admin).
  ownerOrgAdminUserId: string;
  projectId: string;
  projectSlug: string;
  projectDisplayName: string | null;
  gitSourceId: string;
  subpath: string | null;
  repoUrl: string;
  defaultBranch: string;
}

export async function resolveProjectBySlug(
  orgSlug: string,
  projectSlug: string,
): Promise<ResolvedProject | null> {
  const rows = await db
    .select({
      orgSlug: orgs.slug,
      orgDisplayName: orgs.displayName,
      ownerOrgId: orgs.id,
      ownerOrgAdminUserId: orgs.adminUserId,
      projectId: projects.id,
      projectSlug: projects.slug,
      projectDisplayName: projects.displayName,
      gitSourceId: gitSources.id,
      subpath: gitSources.subpath,
      repoUrl: gitSources.repoUrl,
      defaultBranch: gitSources.defaultBranch,
    })
    .from(projects)
    .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
    .innerJoin(gitSources, eq(gitSources.projectId, projects.id))
    .where(and(eq(orgs.slug, orgSlug), eq(projects.slug, projectSlug)))
    .limit(1);
  return rows[0] ?? null;
}

// Stable doco identity row, looked up by its file path inside the git source.
export interface ResolvedDocoIdentity {
  docoId: string;
  pathInSource: string | null;
  deletedAt: Date | null;
  latestPublishedVersionId: string | null;
}

export async function resolveDocoIdentity(
  gitSourceId: string,
  pathInSource: string,
): Promise<ResolvedDocoIdentity | null> {
  // Callers build the path with a `.md` extension (rebuildPathInSource), but the
  // actual file may be `.mdx` (Mintlify import). One URL maps to one file, so
  // matching both candidates is unambiguous.
  const base = stripDocExtension(pathInSource);
  const candidates = base === pathInSource ? [pathInSource] : [`${base}.md`, `${base}.mdx`];
  const rows = await db
    .select({
      docoId: docosTable.id,
      pathInSource: docosTable.pathInSource,
      deletedAt: docosTable.deletedAt,
      latestPublishedVersionId: docosTable.latestPublishedVersionId,
    })
    .from(docosTable)
    .where(
      and(eq(docosTable.gitSourceId, gitSourceId), inArray(docosTable.pathInSource, candidates)),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Display header for a doco (title + kind-path segments), read from its latest
// published version. Used by the discussion routes for the page title and the
// navbar breadcrumb. Falls back to empty when no published version exists.
export async function getDocoHeader(
  latestPublishedVersionId: string | null,
): Promise<{ title: string | null; kindSegments: string[] }> {
  if (latestPublishedVersionId === null) return { title: null, kindSegments: [] };
  const rows = await db
    .select({ title: versions.title, kind: versions.kind })
    .from(versions)
    .where(eq(versions.id, latestPublishedVersionId))
    .limit(1);
  if (rows.length === 0) return { title: null, kindSegments: [] };
  return { title: rows[0].title, kindSegments: fromLtree(rows[0].kind).split("/") };
}
