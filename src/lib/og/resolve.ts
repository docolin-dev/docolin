import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { kinds, versions } from "$lib/server/db/schema";
import { fromLtree, toLtree } from "$lib/server/db/schema/types";
import { resolveProjectBySlug, resolveDocoIdentity } from "$lib/server/doco-resolve";
import { rebuildPathInSource } from "$lib/doco-urls";
import { resolveAuthors, type ResolvedAuthor } from "$lib/server/authors";
import { getProfile } from "$lib/server/profile";
import type { CardSpec } from "./types";

// Server-side slot mappers: each turns a page's identity into a resolved
// CardSpec (or null when the resource doesn't exist, so the endpoint can fall
// back to the default card). Kept lean: they fetch only the handful of fields
// the card draws, never the body or the full page payload.

const DOCO_TYPE_LABELS: Record<string, string> = {
  tutorial: "Tutorial",
  "how-to": "How-to",
  reference: "Reference",
  explanation: "Explanation",
};

/** The first author, formatted as a byline. Prefers a docolin handle, falls
 *  back to a display/external name; omitted when nothing usable resolves. */
function byline(authors: ResolvedAuthor[]): string | undefined {
  const first = authors.at(0);
  if (first === undefined) return undefined;
  if (first.kind === "user") {
    if (first.handle !== "") return `by @${first.handle}`;
    if (first.displayName !== null) return `by ${first.displayName}`;
    return undefined;
  }
  if (first.username !== null) return `by @${first.username}`;
  return `by ${first.name}`;
}

/** A doco card, keyed by its public URL parts. Reads the latest published
 *  version, mirroring the viewer's path handling. */
export async function docoCardSpec(
  org: string,
  project: string,
  urlPath: string,
): Promise<CardSpec | null> {
  const proj = await resolveProjectBySlug(org, project);
  if (proj === null) return null;

  const pathInSource = rebuildPathInSource(urlPath, proj.subpath);
  const identity = await resolveDocoIdentity(proj.gitSourceId, pathInSource);
  if (identity === null) return null;
  const latestVersionId = identity.latestPublishedVersionId;
  if (latestVersionId === null) return null;

  const rows = await db
    .select({
      title: versions.title,
      kind: versions.kind,
      type: versions.type,
      appliesTo: versions.appliesTo,
      pangoScore: versions.verificationScore,
      authors: versions.authors,
    })
    .from(versions)
    .where(eq(versions.id, latestVersionId))
    .limit(1);
  const v = rows.at(0);
  if (v === undefined) return null;

  const authors = await resolveAuthors(v.authors);
  return {
    eyebrow: DOCO_TYPE_LABELS[v.type] ?? "Guide",
    title: v.title,
    breadcrumb: fromLtree(v.kind).split("/"),
    // null renders "not verified yet"; a number renders "Pango <n>".
    pango: v.pangoScore,
    appliesTo: v.appliesTo,
    author: byline(authors),
  };
}

/** A topic (kind) card. Title is the registry display name of the deepest
 *  segment; the ancestors form the breadcrumb. */
export async function kindCardSpec(kindDisplay: string): Promise<CardSpec | null> {
  if (kindDisplay === "") return null;
  const rows = await db
    .select({ displayPath: kinds.displayPath })
    .from(kinds)
    .where(eq(kinds.path, toLtree(kindDisplay)))
    .limit(1);

  const display = rows[0]?.displayPath ?? kindDisplay;
  const segments = display.split("/");
  const title = segments[segments.length - 1];
  const breadcrumb = segments.slice(0, -1);
  return {
    eyebrow: "Topic",
    title,
    breadcrumb: breadcrumb.length > 0 ? breadcrumb : undefined,
  };
}

/** A profile card for /{slug}: a user or an org. */
export async function profileCardSpec(slug: string): Promise<CardSpec | null> {
  const profile = await getProfile(slug);
  if (profile === null) return null;

  if (profile.variant === "user") {
    const { docos, verifications } = profile.stats;
    return {
      eyebrow: "Profile",
      title: profile.displayName ?? `@${profile.handle}`,
      breadcrumb: profile.displayName !== null ? [`@${profile.handle}`] : undefined,
      stat: `${String(docos)} docos · ${String(verifications)} verifications`,
    };
  }
  return {
    eyebrow: "Organization",
    title: profile.displayName ?? profile.slug,
    stat: `${String(profile.docoCount)} docos`,
  };
}
