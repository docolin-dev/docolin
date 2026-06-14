import { error, fail } from "@sveltejs/kit";
import { and, desc, eq, like } from "drizzle-orm";
import { dev } from "$app/environment";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { docos as docosTable, versions } from "$lib/server/db/schema";
import { fromLtree } from "$lib/server/db/schema/types";
import { renderMarkdown, extractDocoToc, extractReadingMinutes } from "$lib/server/markdown";
import { resolveDocoIdentity, resolveProjectBySlug } from "$lib/server/doco-resolve";
import { fileDeletionRequest, submitReport } from "$lib/server/moderation";
import { pathFromSourcePath, rebuildPathInSource, parseVersionRef } from "$lib/doco-urls";
import { resolveAuthors, type ResolvedAuthor } from "$lib/server/authors";
import type { DocoViewData, ResolvedNavLink } from "$lib/doco/viewer-data";
import { resolveLink, splitFragment } from "$lib/doco/resolve-link";
import { isRelativePath, resolveRelativePath } from "$lib/sync/path-resolve";
import { recordStamp } from "$lib/verification/ingest";
import { stampNetworkBucket } from "$lib/server/stamp-bucket";
import type { StampOutcome } from "$lib/verification/score";
import { LIMITS } from "$lib/limits";
// Dev-only markdown playground registry, shared with the link-preview endpoint.
import { PANGO_PAGES, PANGO_SITEMAP } from "./pango/pages.ts";

// Public doco viewer. URL shape per docs/frontmatter-format.md:
//   /{org-or-user}/{project}/{path-from-project-root}
//
// The `path` rest parameter captures `path-from-project-root`. We rebuild
// the file's original `path_in_source` (subpath prefix + path + .md) and
// look it up against the doco identity row.

// Cache policy. The HTML is session-independent (the navbar's per-user widgets
// hydrate from /api/session client-side, see CLAUDE.md "Cache-first arch"), so
// the response is safe to share across all readers. Two URL shapes:
//   - Versioned (`...@{sha-or-versionNumber}`): bytes for that exact ref never
//     change. Browser + edge cache forever, no revalidation.
//   - Latest: browser always revalidates (max-age=0) so authors see their own
//     push instantly; the edge caches for a day, then keeps serving stale for
//     a week while it refreshes in the background. Active CF cache-purge on
//     sync (see $lib/sync/cache-purge) accelerates the happy path so the next
//     reader hits a fresh function invocation right after publish. SWR is the
//     safety net for purge failures.
//
// CRITICAL: these caches are applied to the HTML response only. SvelteKit's
// client-side nav fetches a separate __data.json for every navigation; we
// MUST keep that request uncached. Otherwise the browser cache holds the
// data forever (immutable) and SvelteKit can't get fresh data on subsequent
// version switches, the page locks on whatever version was first served.
// `event.isDataRequest` lets us distinguish the two response types from the
// same load function and apply the right header to each.
const CACHE_VERSIONED = "public, max-age=31536000, immutable";
const CACHE_LATEST = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_DATA_REQUEST = "private, no-store";

export const load: PageServerLoad = async ({ params, setHeaders, isDataRequest }) => {
  // Pango's jungle gym: a dev-only markdown playground. Renders pages from local
  // files instead of the database, split across a sidebar sitemap, so markdown
  // rendering can be iterated live with one source of truth. Never reachable in
  // production. Inlined (not a helper) so the load's own return type covers it.
  if (dev && params.org === "pangos" && params.project === "jungle-gym") {
    setHeaders({ "cache-control": isDataRequest ? CACHE_DATA_REQUEST : "no-store" });
    // Bare /pangos/jungle-gym shows the first page; otherwise the path is the slug.
    const slug = params.path === "" ? PANGO_PAGES[0].slug : params.path;
    const page = PANGO_PAGES.find((candidate) => candidate.slug === slug);
    if (page === undefined) error(404);
    const now = new Date().toISOString();
    // Three authors on purpose, one per byline branch: a docolin user (links
    // to their profile), an external author with a URL (links out), and a
    // plain external name. Also exercises the ", " and " & " separators.
    const playgroundAuthors: ResolvedAuthor[] = [
      {
        kind: "user",
        userId: "playground-user",
        handle: "imgajeed",
        displayName: "Oliver Seifert",
      },
      {
        kind: "external",
        name: "Ada Externling",
        username: "ada",
        url: "https://example.com/ada",
      },
      { kind: "external", name: "Pango", username: null, url: null },
    ];
    return {
      // Dev-only local-file playground: no DB row backs these pages, so the viewer
      // must skip every doco-id-keyed API call (capabilities, etc.). Their synthetic
      // ids aren't valid UUIDs and would 500 the query, but more to the point the
      // gym should never touch the database at all.
      playground: true,
      org: { slug: "pangos", displayName: "Pango" },
      project: { slug: "jungle-gym", displayName: "Pango's jungle gym" },
      gitSource: { repoUrl: "", defaultBranch: "main" },
      pathInSource: null,
      doco: {
        id: `pango-jungle-gym-${page.slug}`,
        versionId: `pango-jungle-gym-${page.slug}-v1`,
        title: page.title,
        description: page.description,
        kind: "pango/jungle-gym",
        type: "reference" as const,
        status: "stable" as const,
        difficulty: null,
        timeEstimateMinMinutes: null,
        timeEstimateMaxMinutes: null,
        language: "en",
        appliesTo: [] as string[],
        deletedAt: null,
        bodyText: page.content,
        bodyHtml: await renderMarkdown(page.content),
        toc: extractDocoToc(page.content),
        readingMinutes: extractReadingMinutes(page.content),
        prevNav: null,
        nextNav: null,
        sitemap: PANGO_SITEMAP,
        authors: playgroundAuthors,
        verifiedCount: 0,
        pangoScore: null,
        lastConfirmedAt: null,
        versionNumber: 1,
        commitSha: null,
        versionTag: null,
        pathFromProjectRoot: page.slug,
        publishedAt: now,
        versions: [
          {
            versionNumber: 1,
            commitSha: null,
            versionTag: null,
            publishedAt: now,
            verifiedCount: 0,
            pangoScore: null,
          },
        ],
      },
    } satisfies DocoViewData;
  }

  // Find project + source for the (org, project) URL pair. Native projects
  // have no git_source row, handled as 404 for v1 since native rendering
  // isn't built yet.
  const proj = await resolveProjectBySlug(params.org, params.project);
  if (proj === null) error(404);

  // Optional @-suffix selects a specific version: `path@123` for a numeric
  // versionNumber, `path@abc1234` (4+ hex chars) for a commit SHA prefix.
  // Truncated SHAs are allowed as long as exactly one version matches.
  const { pathPart, versionRef } = parseVersionRef(params.path);
  const expectedPathInSource = rebuildPathInSource(pathPart, proj.subpath);

  setHeaders({
    "cache-control": isDataRequest
      ? CACHE_DATA_REQUEST
      : versionRef === null
        ? CACHE_LATEST
        : CACHE_VERSIONED,
  });

  // Resolve the doco identity row up front so the version filter can scope
  // commit-SHA prefix matching to a single doco's history. Without this scope,
  // a short prefix could collide across the project.
  const docoIdRow = await resolveDocoIdentity(proj.gitSourceId, expectedPathInSource);
  if (docoIdRow === null) error(404);

  // latestPublishedVersionId is nullable in the schema but always set after
  // a successful sync; treat missing as a 404 rather than failing the query.
  if (versionRef === null && docoIdRow.latestPublishedVersionId === null) error(404);
  const versionFilter =
    versionRef === null
      ? eq(versions.id, docoIdRow.latestPublishedVersionId ?? "")
      : versionRef.kind === "number"
        ? eq(versions.versionNumber, versionRef.value)
        : versionRef.kind === "sha"
          ? like(versions.commitSha, `${versionRef.value}%`)
          : eq(versions.versionTag, versionRef.value);

  // Limit 2: enough to detect ambiguity for short SHA prefixes.
  const docoRows = await db
    .select({
      docoId: docosTable.id,
      pathInSource: docosTable.pathInSource,
      deletedAt: docosTable.deletedAt,
      versionId: versions.id,
      versionNumber: versions.versionNumber,
      commitSha: versions.commitSha,
      versionTag: versions.versionTag,
      title: versions.title,
      description: versions.description,
      kind: versions.kind,
      type: versions.type,
      status: versions.status,
      difficulty: versions.difficulty,
      timeEstimateMinMinutes: versions.timeEstimateMinMinutes,
      timeEstimateMaxMinutes: versions.timeEstimateMaxMinutes,
      language: versions.language,
      appliesTo: versions.appliesTo,
      bodyText: versions.bodyText,
      prevLink: versions.prevLink,
      nextLink: versions.nextLink,
      sitemap: versions.sitemap,
      authors: versions.authors,
      verifiedCount: versions.verificationStampCount,
      pangoScore: versions.verificationScore,
      lastConfirmedAt: versions.verificationLastConfirmedAt,
      publishedAt: versions.publishedAt,
    })
    .from(versions)
    .innerJoin(docosTable, eq(docosTable.id, versions.docoId))
    .where(and(eq(versions.docoId, docoIdRow.docoId), versionFilter))
    .orderBy(desc(versions.versionNumber))
    .limit(2);
  // 0 rows = no such version. 2 rows = ambiguous SHA prefix; ask for more
  // characters by 404-ing rather than silently picking one.
  if (docoRows.length !== 1) error(404);
  const doco = docoRows[0];

  // Author resolution: handle-form entries stored as {userId} need the live
  // displayName + handle joined in. External-form entries already carry their
  // own name/url and pass through.
  const resolvedAuthors = await resolveAuthors(doco.authors);

  // Version list for the dropdown. Sorted newest-first. Pre-alpha: the
  // versioned URL route doesn't exist yet so non-current items 404 when
  // clicked; intentional and forward-compatible.
  const versionRows = await db
    .select({
      versionNumber: versions.versionNumber,
      commitSha: versions.commitSha,
      versionTag: versions.versionTag,
      publishedAt: versions.publishedAt,
      verifiedCount: versions.verificationStampCount,
      pangoScore: versions.verificationScore,
    })
    .from(versions)
    .where(eq(versions.docoId, doco.docoId))
    .orderBy(desc(versions.versionNumber));

  // Compute path-from-project-root for the versioned-URL form in the dropdown.
  const pathFromProjectRoot = pathFromSourcePath(doco.pathInSource ?? "", proj.subpath);

  const bodyHtml = await renderMarkdown(doco.bodyText);
  const toc = extractDocoToc(doco.bodyText);
  const readingMinutes = extractReadingMinutes(doco.bodyText);

  // Resolve prev/next link strings into rich nav targets where possible:
  // relative paths and same-project hard URLs become {title, href, kindPath}.
  // Anything else (cross-project, soft kind URLs, external) falls back to
  // the raw string so the user still sees and can follow the link.
  const navCtx: NavLinkContext = {
    orgSlug: proj.orgSlug,
    projectSlug: proj.projectSlug,
    gitSourceId: proj.gitSourceId,
    subpath: proj.subpath,
    currentPathInSource: doco.pathInSource ?? "",
    repoUrl: proj.repoUrl,
    commitSha: doco.commitSha,
    defaultBranch: proj.defaultBranch,
  };
  const [prevNav, nextNav] = await Promise.all([
    resolveNavLink(doco.prevLink, navCtx),
    resolveNavLink(doco.nextLink, navCtx),
  ]);

  return {
    playground: false,
    org: { slug: proj.orgSlug, displayName: proj.orgDisplayName },
    project: {
      slug: proj.projectSlug,
      displayName: proj.projectDisplayName,
    },
    // Source coordinates needed by the viewer to build the "Edit on GitHub"
    // affordance. Discussions URL is a docolin route, not a git host one, so
    // it doesn't need anything from here. pathInSource on doco below carries
    // the file path for the GitHub editor.
    gitSource: {
      repoUrl: proj.repoUrl,
      defaultBranch: proj.defaultBranch,
    },
    pathInSource: doco.pathInSource,
    doco: {
      id: doco.docoId,
      // The displayed version's id, so the viewer's moderation menu can report
      // or request deletion of this exact version.
      versionId: doco.versionId,
      title: doco.title,
      description: doco.description,
      kind: fromLtree(doco.kind),
      type: doco.type,
      status: doco.status,
      difficulty: doco.difficulty,
      timeEstimateMinMinutes: doco.timeEstimateMinMinutes,
      timeEstimateMaxMinutes: doco.timeEstimateMaxMinutes,
      language: doco.language,
      appliesTo: doco.appliesTo,
      deletedAt: doco.deletedAt?.toISOString() ?? null,
      bodyText: doco.bodyText,
      bodyHtml,
      toc,
      readingMinutes,
      prevNav,
      nextNav,
      sitemap: doco.sitemap,
      authors: resolvedAuthors,
      verifiedCount: doco.verifiedCount,
      pangoScore: doco.pangoScore,
      lastConfirmedAt: doco.lastConfirmedAt?.toISOString() ?? null,
      versionNumber: doco.versionNumber,
      commitSha: doco.commitSha,
      versionTag: doco.versionTag,
      pathFromProjectRoot,
      publishedAt: doco.publishedAt.toISOString(),
      versions: versionRows.map((v) => ({
        versionNumber: v.versionNumber,
        commitSha: v.commitSha,
        versionTag: v.versionTag,
        publishedAt: v.publishedAt.toISOString(),
        verifiedCount: v.verifiedCount,
        pangoScore: v.pangoScore,
      })),
    },
  } satisfies DocoViewData;
};

interface NavLinkContext {
  orgSlug: string;
  projectSlug: string;
  gitSourceId: string;
  subpath: string | null;
  currentPathInSource: string;
  // For routing a prev/next link through resolveLink: a non-doco target
  // resolves to the forge file, pinned to this doco's synced commit.
  repoUrl: string;
  commitSha: string | null;
  defaultBranch: string;
}

async function resolveNavLink(
  raw: string | null,
  ctx: NavLinkContext,
): Promise<ResolvedNavLink | null> {
  if (raw === null) return null;

  // Ground truth at read time: does this point at an existing doco in this
  // project? The DB is more accurate than an extension heuristic and handles
  // `.md` and Mintlify `.mdx` alike. Compute a candidate source path for
  // relative and same-project-absolute links (resolveRelativePath preserves the
  // extension, so an .mdx target is found).
  const { path: pathPart } = splitFragment(raw);
  const sameProjectPrefix = `/${ctx.orgSlug}/${ctx.projectSlug}/`;
  let candidate: string | null = null;
  if (isRelativePath(pathPart)) {
    candidate = resolveRelativePath(ctx.currentPathInSource, pathPart);
  } else if (pathPart.startsWith(sameProjectPrefix)) {
    candidate = rebuildPathInSource(pathPart.slice(sameProjectPrefix.length), ctx.subpath);
  }
  if (candidate !== null) {
    const card = await lookupNavTarget(candidate, ctx);
    if (card !== null) return card;
  }

  // Not an existing doco: route through the shared link model so a relative repo
  // file becomes a forge link (pinned to the commit) and external / soft kind
  // URLs pass through. allowMdx tracks the project type (a Mintlify project's
  // docos are .mdx), inferred from this doco's own extension.
  return {
    kind: "raw",
    href: resolveLink(raw, {
      docoPath: ctx.currentPathInSource,
      subpath: ctx.subpath,
      allowMdx: ctx.currentPathInSource.toLowerCase().endsWith(".mdx"),
      websiteBase: `/${ctx.orgSlug}/${ctx.projectSlug}`,
      forge: {
        kind: "repo",
        repoUrl: ctx.repoUrl,
        ref: ctx.commitSha !== null ? { commit: ctx.commitSha } : { branch: ctx.defaultBranch },
      },
    }),
  };
}

async function lookupNavTarget(
  targetPathInSource: string,
  ctx: NavLinkContext,
): Promise<ResolvedNavLink | null> {
  const rows = await db
    .select({
      title: versions.title,
      kind: versions.kind,
      pathInSource: docosTable.pathInSource,
    })
    .from(docosTable)
    .innerJoin(versions, eq(versions.id, docosTable.latestPublishedVersionId))
    .where(
      and(
        eq(docosTable.gitSourceId, ctx.gitSourceId),
        eq(docosTable.pathInSource, targetPathInSource),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  const target = rows[0];
  if (target.pathInSource === null) return null;

  const pathFromRoot = pathFromSourcePath(target.pathInSource, ctx.subpath);
  return {
    kind: "resolved",
    title: target.title,
    kindPath: fromLtree(target.kind),
    href: `/${ctx.orgSlug}/${ctx.projectSlug}/${pathFromRoot}`,
  };
}

function fieldStr(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

// Moderation from the viewer targets the displayed version (target_type
// "version"). Reporting a doco routes straight to platform staff; "request
// deletion" is moderator-only. Versions have no in-place hide yet, so neither
// changes the rendered page; both just file a record for the admin queue.
function isStampOutcome(value: string): value is StampOutcome {
  return value === "worked" || value === "worked_with_caveats" || value === "didnt_work";
}

export const actions = {
  report: async ({ request, params, locals }) => {
    if (!locals.dbUser) return fail(401, { action: "report", error: "generic" });
    const form = await request.formData();
    const targetId = fieldStr(form, "targetId");
    const reason = fieldStr(form, "reason");
    // Moderator context, not authored content; truncating beats erroring.
    const details = fieldStr(form, "details").trim().slice(0, LIMITS.moderationDetails);
    if (fieldStr(form, "targetType") !== "version" || targetId.length === 0) {
      return fail(400, { action: "report", error: "generic" });
    }

    const res = await submitReport({
      targetType: "version",
      targetId,
      reportedByUserId: locals.dbUser.id,
      reason,
      details,
      targetUrl: `/${params.org}/${params.project}/${params.path}`,
    });
    if (!res.ok) {
      return fail(res.reason === "invalid_reason" ? 400 : 404, {
        action: "report",
        error: res.reason,
      });
    }
    return { action: "report", ok: true };
  },

  requestDeletion: async ({ request, params, locals }) => {
    if (!locals.dbUser) return fail(401, { action: "requestDeletion", error: "generic" });
    const form = await request.formData();
    const targetId = fieldStr(form, "targetId");
    const reason = fieldStr(form, "reason");
    // Moderator context, not authored content; truncating beats erroring.
    const details = fieldStr(form, "details").trim().slice(0, LIMITS.moderationDetails);
    if (
      fieldStr(form, "targetType") !== "version" ||
      targetId.length === 0 ||
      reason.length === 0
    ) {
      return fail(400, { action: "requestDeletion", error: "generic" });
    }

    const res = await fileDeletionRequest({
      targetType: "version",
      targetId,
      reason,
      details,
      user: { id: locals.dbUser.id, isPlatformAdmin: locals.dbUser.isPlatformAdmin },
      targetUrl: `/${params.org}/${params.project}/${params.path}`,
    });
    if (!res.ok) {
      return fail(res.reason === "forbidden" ? 403 : res.reason === "invalid_reason" ? 400 : 404, {
        action: "requestDeletion",
        error: res.reason,
      });
    }
    return { action: "requestDeletion", ok: true };
  },

  stamp: async ({ request, params, locals, getClientAddress }) => {
    const form = await request.formData();
    const versionId = fieldStr(form, "versionId");
    const outcome = fieldStr(form, "outcome");
    if (!isStampOutcome(outcome) || versionId.length === 0) {
      return fail(400, { action: "stamp", error: "generic" });
    }

    // Don't trust the client to point the stamp at an arbitrary version: confirm
    // it belongs to the project in the URL.
    const proj = await resolveProjectBySlug(params.org, params.project);
    if (proj === null) return fail(404, { action: "stamp", error: "generic" });
    const owned = await db
      .select({ id: versions.id })
      .from(versions)
      .innerJoin(docosTable, eq(docosTable.id, versions.docoId))
      .where(and(eq(versions.id, versionId), eq(docosTable.projectId, proj.projectId)))
      .limit(1);
    if (owned.length === 0) return fail(404, { action: "stamp", error: "generic" });

    const voter = locals.dbUser ?? null;
    await recordStamp({
      versionId,
      outcome,
      source: voter ? "human" : "anonymous",
      voterUserId: voter ? voter.id : null,
      // Keyed coarse network bucket: lets scoring discount correlated
      // anonymous bursts from one network without ever storing an address.
      networkBucket: await stampNetworkBucket(getClientAddress()),
    });

    // The write stays a single insert. The score recompute is debounced off the
    // write path by /api/cron/recompute-scores, which coalesces a burst of stamps
    // on the same version into one recompute.
    return { action: "stamp", ok: true };
  },
} satisfies Actions;
