import { and, count, desc, eq, isNull, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
  discussionReplies,
  discussions,
  docos,
  gitSources,
  latestVersions,
  orgs,
  projects,
  stamps,
  users,
} from "$lib/server/db/schema";
import { listedDocoSelection, toListedDoco, type ListedDoco } from "$lib/server/doco-rows";

// Public profile data for /{slug}. The slug namespace is shared: every user's
// personal org carries their handle as its slug, so one lookup serves both
// shapes. A personal org renders as a user profile (identity from the user
// row); any other org renders as an org profile.
//
// Privacy note: verification activity is exposed as an aggregate count only,
// never which docos someone verified. What a person reads and runs on their
// systems is theirs; the count is the public contribution signal.

const DOCO_LIMIT = 30;

// Bounds the org doco query. A single-project org lists everything fetched; a
// multi-project org previews a few per project (the component slices), with
// each project's true total carried in docoCount.
const ORG_DOCO_FETCH_LIMIT = 100;

// Profiles list docos in the shared listing shape (see $lib/server/doco-rows).
export type ProfileDoco = ListedDoco;

export interface UserProfileStats {
  docos: number;
  discussions: number;
  replies: number;
  verifications: number;
}

export interface ProfileProject {
  slug: string;
  displayName: string | null;
  /** Upstream repo the project syncs from; the provenance / legitimacy signal. */
  repoUrl: string | null;
  docoCount: number;
  /** Newest docos (bounded by the org-wide fetch cap). */
  docos: ProfileDoco[];
}

export type Profile =
  | {
      variant: "user";
      handle: string;
      displayName: string | null;
      since: string;
      stats: UserProfileStats;
      docos: ProfileDoco[];
    }
  | {
      variant: "org";
      slug: string;
      displayName: string | null;
      since: string;
      docoCount: number;
      projects: ProfileProject[];
    };

// authors is jsonb of entries like {"userId": "..."}; containment finds the
// user anywhere in the array. No GIN index yet; fine at current volume, add
// one if profiles get hot.
function authoredBy(userId: string): SQL {
  return sql`${latestVersions.authors} @> ${JSON.stringify([{ userId }])}::jsonb`;
}

async function userDocos(userId: string, personalOrgId: string | null): Promise<ProfileDoco[]> {
  // Docos they authored anywhere on docolin, plus docos hosted under their
  // personal org (a maintainer's synced project counts even when frontmatter
  // doesn't attribute them).
  const where =
    personalOrgId === null
      ? authoredBy(userId)
      : sql`(${authoredBy(userId)} OR ${projects.ownerOrgId} = ${personalOrgId})`;
  const rows = await db
    .select(listedDocoSelection)
    .from(latestVersions)
    .innerJoin(docos, and(eq(docos.id, latestVersions.docoId), isNull(docos.deletedAt)))
    .innerJoin(projects, eq(projects.id, docos.projectId))
    .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
    .leftJoin(gitSources, eq(gitSources.projectId, projects.id))
    .where(where)
    .orderBy(desc(latestVersions.publishedAt))
    .limit(DOCO_LIMIT);
  return rows.map(toListedDoco);
}

async function orgProjects(orgId: string): Promise<ProfileProject[]> {
  const [projectRows, countRows, docoRows] = await Promise.all([
    db
      .select({
        slug: projects.slug,
        displayName: projects.displayName,
        repoUrl: gitSources.repoUrl,
      })
      .from(projects)
      .leftJoin(gitSources, eq(gitSources.projectId, projects.id))
      .where(eq(projects.ownerOrgId, orgId)),
    db
      .select({ projectSlug: projects.slug, n: count() })
      .from(docos)
      .innerJoin(projects, eq(projects.id, docos.projectId))
      .where(
        and(
          eq(projects.ownerOrgId, orgId),
          isNull(docos.deletedAt),
          isNotNull(docos.latestPublishedVersionId),
        ),
      )
      .groupBy(projects.slug),
    db
      .select(listedDocoSelection)
      .from(latestVersions)
      .innerJoin(docos, and(eq(docos.id, latestVersions.docoId), isNull(docos.deletedAt)))
      .innerJoin(projects, eq(projects.id, docos.projectId))
      .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
      .leftJoin(gitSources, eq(gitSources.projectId, projects.id))
      .where(eq(projects.ownerOrgId, orgId))
      .orderBy(desc(latestVersions.publishedAt))
      .limit(ORG_DOCO_FETCH_LIMIT),
  ]);

  const countBySlug = new Map(countRows.map((r) => [r.projectSlug, r.n]));
  const docosBySlug = new Map<string, ProfileDoco[]>();
  for (const row of docoRows) {
    const list = docosBySlug.get(row.projectSlug) ?? [];
    list.push(toListedDoco(row));
    docosBySlug.set(row.projectSlug, list);
  }

  // Biggest project first: the org's flagship is what visitors came to find.
  return projectRows
    .map((p) => ({
      slug: p.slug,
      displayName: p.displayName,
      repoUrl: p.repoUrl,
      docoCount: countBySlug.get(p.slug) ?? 0,
      docos: docosBySlug.get(p.slug) ?? [],
    }))
    .sort((a, b) => b.docoCount - a.docoCount);
}

async function userStats(userId: string, docosShown: number): Promise<UserProfileStats> {
  const [discussionRows, replyRows, stampRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(discussions)
      .where(and(eq(discussions.createdByUserId, userId), isNull(discussions.hiddenAt))),
    db
      .select({ n: count() })
      .from(discussionReplies)
      .where(
        and(eq(discussionReplies.createdByUserId, userId), isNull(discussionReplies.hiddenAt)),
      ),
    db.select({ n: count() }).from(stamps).where(eq(stamps.voterUserId, userId)),
  ]);
  return {
    // The doco list is capped at DOCO_LIMIT, so its length is the count for
    // every realistic profile today; a "and N more" treatment can come with
    // pagination if anyone outgrows the cap.
    docos: docosShown,
    discussions: discussionRows[0]?.n ?? 0,
    replies: replyRows[0]?.n ?? 0,
    verifications: stampRows[0]?.n ?? 0,
  };
}

/** Loads the public profile behind /{slug}: a user (via their personal org or
 *  handle) or an org. Returns null when the slug matches neither. */
export async function getProfile(slug: string): Promise<Profile | null> {
  const orgRows = await db
    .select({
      id: orgs.id,
      slug: orgs.slug,
      displayName: orgs.displayName,
      createdAt: orgs.createdAt,
    })
    .from(orgs)
    .where(eq(orgs.slug, slug));
  const org = orgRows.length > 0 ? orgRows[0] : null;

  // Personal org (or, defensively, a handle without an org row) -> user profile.
  const userRows = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      personalOrgId: users.personalOrgId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        org === null ? eq(users.handle, slug) : eq(users.personalOrgId, org.id),
      ),
    );
  const user = userRows.length > 0 ? userRows[0] : null;

  if (user !== null) {
    const docoList = await userDocos(user.id, user.personalOrgId);
    return {
      variant: "user",
      handle: user.handle,
      displayName: user.displayName,
      since: user.createdAt.toISOString(),
      stats: await userStats(user.id, docoList.length),
      docos: docoList,
    };
  }
  if (org === null) return null;

  const projectList = await orgProjects(org.id);
  return {
    variant: "org",
    slug: org.slug,
    displayName: org.displayName,
    since: org.createdAt.toISOString(),
    docoCount: projectList.reduce((sum, p) => sum + p.docoCount, 0),
    projects: projectList,
  };
}
