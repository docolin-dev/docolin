import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getDocoHeader, resolveDocoIdentity, resolveProjectBySlug } from "$lib/server/doco-resolve";
import { createDiscussion, notifyMentions } from "$lib/server/discussions";
import { LIMITS, isRequestBodyTooLarge } from "$lib/limits";
import { discussionRef, discussionUrls, rebuildPathInSource } from "$lib/doco-urls";
import { purgeCacheUrls } from "$lib/sync/cache-purge";
import { localizeHref } from "$paraglide/runtime";

// Dedicated "start a discussion" page. Kept separate from the thread list so
// each surface stays focused (the list is for scanning, this is for writing).
// A cached public shell like the rest of the discussion surfaces: the form's
// signed-in vs anonymous state hydrates client-side, and `new` wins over the
// `[discussionId]` sibling via SvelteKit route specificity.
const CACHE_LATEST = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";
const CACHE_DATA_REQUEST = "private, no-store";

function fieldStr(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export const load: PageServerLoad = async ({ params, setHeaders, isDataRequest }) => {
  const proj = await resolveProjectBySlug(params.org, params.project);
  if (proj === null) error(404);
  const docoIdRow = await resolveDocoIdentity(
    proj.gitSourceId,
    rebuildPathInSource(params.path, proj.subpath),
  );
  if (docoIdRow === null) error(404);

  setHeaders({ "cache-control": isDataRequest ? CACHE_DATA_REQUEST : CACHE_LATEST });

  const header = await getDocoHeader(docoIdRow.latestPublishedVersionId);

  return {
    org: { slug: proj.orgSlug, displayName: proj.orgDisplayName },
    project: { slug: proj.projectSlug, displayName: proj.projectDisplayName },
    docoPath: params.path,
    docoTitle: header.title ?? params.path,
    kindSegments: header.kindSegments,
  };
};

export const actions = {
  create: async ({ request, params, locals, platform }) => {
    const discussionsPath = `/${params.org}/${params.project}/${params.path}/discussions`;
    if (!locals.dbUser) {
      redirect(
        303,
        localizeHref(`/signin?returnTo=${encodeURIComponent(`${discussionsPath}/new`)}`),
      );
    }

    if (isRequestBodyTooLarge(request)) return fail(413, { error: "body_too_long" });

    const form = await request.formData();
    const title = fieldStr(form, "title").trim();
    // Body is optional (GitHub-issue style): a title-only discussion is fine.
    const body = fieldStr(form, "body").trim();
    if (title.length === 0) return fail(400, { error: "title_required", title, body });
    // Over-limit input fails loudly instead of being truncated: this is authored
    // content, and silently dropping someone's text is worse than an error.
    if (title.length > LIMITS.discussionTitle) {
      return fail(400, { error: "title_too_long", title, body });
    }
    if (body.length > LIMITS.discussionBody) {
      return fail(400, { error: "body_too_long", title, body });
    }

    const proj = await resolveProjectBySlug(params.org, params.project);
    if (proj === null) return fail(404, { error: "generic" });
    const docoIdRow = await resolveDocoIdentity(
      proj.gitSourceId,
      rebuildPathInSource(params.path, proj.subpath),
    );
    if (docoIdRow === null) return fail(404, { error: "generic" });

    const { id, number } = await createDiscussion({
      docoId: docoIdRow.docoId,
      title,
      bodyText: body,
      userId: locals.dbUser.id,
    });

    const threadUrl = `${discussionsPath}/${discussionRef(number, title)}`;
    // New thread appears in the (cached) list; purge it. Best-effort, like the
    // @mention fan-out (title counts too: "see @alice's question" headlines).
    platform?.context.waitUntil(
      Promise.all([
        notifyMentions({
          discussionId: id,
          bodyText: `${title}\n${body}`,
          threadUrl,
          actorUserId: locals.dbUser.id,
        }),
        purgeCacheUrls(
          discussionUrls({
            orgSlug: proj.orgSlug,
            projectSlug: proj.projectSlug,
            pathFromProjectRoot: params.path,
          }),
        ),
      ]),
    );

    redirect(303, localizeHref(threadUrl));
  },
} satisfies Actions;
