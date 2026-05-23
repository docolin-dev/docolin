import { error, fail } from "@sveltejs/kit";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import matter from "gray-matter";
import { dev } from "$app/environment";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { docos as docosTable, users, versions } from "$lib/server/db/schema";
import { fromLtree } from "$lib/server/db/schema/types";
import { renderMarkdown, extractDocoToc } from "$lib/server/markdown";
import { resolveDocoIdentity, resolveProjectBySlug } from "$lib/server/doco-resolve";
import { fileDeletionRequest, submitReport } from "$lib/server/moderation";
import { pathFromSourcePath, rebuildPathInSource } from "$lib/doco-urls";
// Dev-only markdown playground content. Each file under ./pango is one page;
// ?raw bundles + watches it so editing live-reloads in dev. See the playground
// branch in `load`.
import pangoWelcome from "./pango/welcome.md?raw";
import pangoText from "./pango/text.md?raw";
import pangoCode from "./pango/code.md?raw";
import pangoTables from "./pango/tables.md?raw";
import pangoAdmonitions from "./pango/admonitions.md?raw";
import pangoSteps from "./pango/steps.md?raw";
import pangoCards from "./pango/cards.md?raw";
import pangoAccordion from "./pango/accordion.md?raw";
import pangoTabs from "./pango/tabs.md?raw";
import pangoNesting from "./pango/nesting.md?raw";
import pangoCrazy from "./pango/crazy.md?raw";

interface PangoPage {
  slug: string;
  title: string;
  description: string | null;
  content: string;
}

// Each file is one page; frontmatter is parsed once at module load.
const PANGO_PAGES: PangoPage[] = [
  { slug: "welcome", raw: pangoWelcome },
  { slug: "text", raw: pangoText },
  { slug: "code", raw: pangoCode },
  { slug: "tables", raw: pangoTables },
  { slug: "admonitions", raw: pangoAdmonitions },
  { slug: "steps", raw: pangoSteps },
  { slug: "cards", raw: pangoCards },
  { slug: "accordion", raw: pangoAccordion },
  { slug: "tabs", raw: pangoTabs },
  { slug: "nesting", raw: pangoNesting },
  { slug: "crazy", raw: pangoCrazy },
].map(({ slug, raw }) => {
  const { data, content } = matter(raw);
  const fm = data as Record<string, unknown>;
  return {
    slug,
    title: typeof fm.title === "string" ? fm.title : slug,
    description: typeof fm.description === "string" ? fm.description : null,
    content,
  };
});

// Sectioned sidebar nav, which also exercises the viewer's branch (children)
// rendering. Leaf urls match the page slugs above.
const PANGO_SITEMAP = [
  { title: "Welcome", url: "/pangos/jungle-gym/welcome" },
  {
    title: "Basics",
    children: [
      { title: "Text & lists", url: "/pangos/jungle-gym/text" },
      { title: "Code blocks", url: "/pangos/jungle-gym/code" },
      { title: "Tables & more", url: "/pangos/jungle-gym/tables" },
    ],
  },
  {
    title: "Callouts & constructs",
    children: [
      { title: "Admonitions", url: "/pangos/jungle-gym/admonitions" },
      { title: "Steps", url: "/pangos/jungle-gym/steps" },
      { title: "Cards", url: "/pangos/jungle-gym/cards" },
      { title: "Accordion", url: "/pangos/jungle-gym/accordion" },
      { title: "Content tabs", url: "/pangos/jungle-gym/tabs" },
    ],
  },
  {
    title: "Edge cases",
    children: [
      { title: "Nesting & edge cases", url: "/pangos/jungle-gym/nesting" },
      { title: "Crazy nesting", url: "/pangos/jungle-gym/crazy" },
    ],
  },
];

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
    const playgroundAuthors: ResolvedAuthor[] = [
      { kind: "external", name: "Pango", username: null, url: null },
    ];
    return {
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
        prevNav: null,
        nextNav: null,
        sitemap: PANGO_SITEMAP,
        authors: playgroundAuthors,
        verifiedCount: 0,
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
          },
        ],
      },
    };
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
        : like(versions.commitSha, `${versionRef.value}%`);

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
      verifiedCount: versions.upVotesCache,
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
      verifiedCount: versions.upVotesCache,
    })
    .from(versions)
    .where(eq(versions.docoId, doco.docoId))
    .orderBy(desc(versions.versionNumber));

  // Compute path-from-project-root for the versioned-URL form in the dropdown.
  const pathFromProjectRoot = pathFromSourcePath(doco.pathInSource ?? "", proj.subpath);

  const bodyHtml = await renderMarkdown(doco.bodyText);
  const toc = extractDocoToc(doco.bodyText);

  // Resolve prev/next link strings into rich nav targets where possible:
  // relative paths and same-project hard URLs become {title, href, kindPath}.
  // Anything else (cross-project, soft kind URLs, external) falls back to
  // the raw string so the user still sees and can follow the link.
  const [prevNav, nextNav] = await Promise.all([
    resolveNavLink(doco.prevLink, {
      orgSlug: proj.orgSlug,
      projectSlug: proj.projectSlug,
      gitSourceId: proj.gitSourceId,
      subpath: proj.subpath,
      currentPathInSource: doco.pathInSource ?? "",
    }),
    resolveNavLink(doco.nextLink, {
      orgSlug: proj.orgSlug,
      projectSlug: proj.projectSlug,
      gitSourceId: proj.gitSourceId,
      subpath: proj.subpath,
      currentPathInSource: doco.pathInSource ?? "",
    }),
  ]);

  return {
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
      prevNav,
      nextNav,
      sitemap: doco.sitemap,
      authors: resolvedAuthors,
      verifiedCount: doco.verifiedCount,
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
      })),
    },
  };
};

// Resolved author entry shape served to the page. Discriminated by which
// side of the union the source had: docolin user vs external attribution.
export type ResolvedAuthor =
  | { kind: "user"; userId: string; handle: string; displayName: string | null }
  | { kind: "external"; name: string; username: string | null; url: string | null };

async function resolveAuthors(raw: unknown): Promise<ResolvedAuthor[]> {
  if (!Array.isArray(raw)) return [];

  // First pass: classify and collect userIds for the join.
  const out: ResolvedAuthor[] = [];
  const userIds: string[] = [];
  const userSlots: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.userId === "string") {
      out.push({ kind: "user", userId: obj.userId, handle: "", displayName: null });
      userIds.push(obj.userId);
      userSlots.push(out.length - 1);
    } else if (typeof obj.name === "string") {
      out.push({
        kind: "external",
        name: obj.name,
        username: typeof obj.username === "string" ? obj.username : null,
        url: typeof obj.url === "string" ? obj.url : null,
      });
    }
  }

  // Second pass: hydrate handle + displayName for user entries.
  if (userIds.length > 0) {
    const rows = await db
      .select({ id: users.id, handle: users.handle, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, userIds));
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const slot of userSlots) {
      const entry = out[slot];
      if (entry.kind !== "user") continue;
      const row = map.get(entry.userId);
      if (row !== undefined) {
        entry.handle = row.handle;
        entry.displayName = row.displayName;
      }
    }
  }

  return out;
}

// Rich prev/next nav target. Resolved entries carry the destination's title
// and kind so the card can render with real content; raw entries fall back
// to the original link string when resolution fails (external URLs, kind-
// based soft URLs, or cross-project links we don't index yet).
export type ResolvedNavLink =
  | { kind: "resolved"; title: string; kindPath: string; href: string }
  | { kind: "raw"; href: string };

interface NavLinkContext {
  orgSlug: string;
  projectSlug: string;
  gitSourceId: string;
  subpath: string | null;
  currentPathInSource: string;
}

async function resolveNavLink(
  raw: string | null,
  ctx: NavLinkContext,
): Promise<ResolvedNavLink | null> {
  if (raw === null) return null;

  // Relative path in the same project: ./foo.md, ../bar.md
  if (raw.startsWith("./") || raw.startsWith("../")) {
    const targetPath = joinRelativePath(ctx.currentPathInSource, raw);
    return await lookupNavTarget(targetPath, ctx);
  }

  // Hard URL: /{org}/{project}/{path-from-project-root}. Same-project case
  // resolves; cross-project would need a wider query and is deferred.
  if (raw.startsWith("/")) {
    const parts = raw.slice(1).split("/");
    if (parts.length >= 3 && parts[0] === ctx.orgSlug && parts[1] === ctx.projectSlug) {
      const pathFromRoot = parts.slice(2).join("/");
      const targetPath = rebuildPathInSource(pathFromRoot, ctx.subpath);
      const resolved = await lookupNavTarget(targetPath, ctx);
      if (resolved !== null) return resolved;
    }
  }

  // External, cross-project, or soft kind URL: pass through unchanged.
  return { kind: "raw", href: raw };
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

// Resolves "./foo.md" or "../bar/baz.md" against a current pathInSource.
// String ops only; no path library needed for this shape.
function joinRelativePath(currentPath: string, relative: string): string {
  const lastSlash = currentPath.lastIndexOf("/");
  let base = lastSlash === -1 ? "" : currentPath.slice(0, lastSlash);

  let rel = relative;
  while (rel.startsWith("./")) rel = rel.slice(2);
  while (rel.startsWith("../")) {
    rel = rel.slice(3);
    const baseLastSlash = base.lastIndexOf("/");
    base = baseLastSlash === -1 ? "" : base.slice(0, baseLastSlash);
  }

  return base.length === 0 ? rel : `${base}/${rel}`;
}

// Splits a URL path into (path, versionRef). The version ref is only
// recognized when the @-suffix is unambiguously a versionNumber (all digits)
// or a commit SHA prefix (4+ lowercase hex chars). Anything else stays in
// the path so paths containing literal `@` aren't silently truncated.
function parseVersionRef(urlPath: string): {
  pathPart: string;
  versionRef: { kind: "number"; value: number } | { kind: "sha"; value: string } | null;
} {
  const at = urlPath.lastIndexOf("@");
  if (at === -1 || at === urlPath.length - 1) return { pathPart: urlPath, versionRef: null };
  const suffix = urlPath.slice(at + 1);
  const before = urlPath.slice(0, at);

  if (isAllDigits(suffix)) {
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n) && n > 0) {
      return { pathPart: before, versionRef: { kind: "number", value: n } };
    }
  }
  if (suffix.length >= 4 && suffix.length <= 40 && isAllHexLower(suffix)) {
    return { pathPart: before, versionRef: { kind: "sha", value: suffix } };
  }
  return { pathPart: urlPath, versionRef: null };
}

function isAllDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) {
    if (c < "0" || c > "9") return false;
  }
  return true;
}

function isAllHexLower(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) {
    const isDigit = c >= "0" && c <= "9";
    const isHexLetter = c >= "a" && c <= "f";
    if (!isDigit && !isHexLetter) return false;
  }
  return true;
}

function fieldStr(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

// Moderation from the viewer targets the displayed version (target_type
// "version"). Reporting a doco routes straight to platform staff; "request
// deletion" is moderator-only. Versions have no in-place hide yet, so neither
// changes the rendered page; both just file a record for the admin queue.
export const actions = {
  report: async ({ request, params, locals }) => {
    if (!locals.dbUser) return fail(401, { action: "report", error: "generic" });
    const form = await request.formData();
    const targetId = fieldStr(form, "targetId");
    const reason = fieldStr(form, "reason");
    const details = fieldStr(form, "details").trim();
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
    const details = fieldStr(form, "details").trim();
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
} satisfies Actions;
