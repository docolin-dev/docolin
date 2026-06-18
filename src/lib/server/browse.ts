import { and, count, desc, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
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
  versions,
} from "$lib/server/db/schema";
import { listedDocoSelection, toListedDoco, type ListedDoco } from "$lib/server/doco-rows";
import { EXAMPLE_KIND_ROOT } from "$lib/sync/frontmatter-schema";

// The browse feed: what's moving on docolin. "Trending" is built from the only
// usage signals the platform collects, all public and volunteered: stamps
// (someone confirmed a guide worked) and discussion activity. No page views
// exist, by design. Everything here is reader-independent, so the page stays
// one cached payload for everyone; per-reader tuning happens client-side.

const TRENDING_LIMIT = 8;
const FRESH_LIMIT = 6;
// The serendipity pool ships larger than what's shown so the client can swap
// in setup-matched picks without another request (same row count, no shift).
const POOL_LIMIT = 16;
// Below this many active docos the window widens; a "trending" list of one
// reads as a dead site even when that one doco is genuinely moving.
const MIN_TRENDING = 4;

// Stamps say "this worked on a real system" and outweigh conversation;
// threads outweigh replies (starting a discussion is the stronger signal).
const STAMP_WEIGHT = 3;
const THREAD_WEIGHT = 2;
const REPLY_WEIGHT = 1;

export type TrendingWindow = "week" | "month" | "all";

export interface TrendingDoco extends ListedDoco {
  /** Stamps inside the trending window (0 for the all-time fallback). */
  windowStamps: number;
  /** Threads + replies inside the trending window. */
  windowDiscussions: number;
}

export interface BrowseEvent {
  type: "verified" | "discussion";
  docoTitle: string;
  docoHref: string;
  at: string;
}

export interface BrowseFeed {
  trendingWindow: TrendingWindow;
  trending: TrendingDoco[];
  fresh: ListedDoco[];
  /** The three most recent in-window events for the ticker line; empty in the
   *  all-time fallback (a weeks-old "latest event" reads as a tombstone).
   *  Anonymized by construction: no actor is ever selected. */
  events: BrowseEvent[];
  /** Daily-rotating serendipity pool; the client shows a slice, swapping in
   *  setup-matched entries when a local profile exists. */
  pool: ListedDoco[];
}

interface Activity {
  stamps: number;
  threads: number;
  replies: number;
}

function score(a: Activity): number {
  return a.stamps * STAMP_WEIGHT + a.threads * THREAD_WEIGHT + a.replies * REPLY_WEIGHT;
}

// Per-doco activity counts inside the window: three grouped scans (stamps via
// versions, threads, replies via their thread). Volumes are tiny and the page
// is edge-cached, so this runs on cache misses, not per reader.
async function activitySince(since: Date): Promise<Map<string, Activity>> {
  const [stampRows, threadRows, replyRows] = await Promise.all([
    db
      .select({ docoId: versions.docoId, n: count() })
      .from(stamps)
      .innerJoin(versions, eq(versions.id, stamps.versionId))
      .where(gte(stamps.createdAt, since))
      .groupBy(versions.docoId),
    db
      .select({ docoId: discussions.docoId, n: count() })
      .from(discussions)
      .where(and(gte(discussions.createdAt, since), isNull(discussions.hiddenAt)))
      .groupBy(discussions.docoId),
    db
      .select({ docoId: discussions.docoId, n: count() })
      .from(discussionReplies)
      .innerJoin(discussions, eq(discussions.id, discussionReplies.discussionId))
      .where(and(gte(discussionReplies.createdAt, since), isNull(discussionReplies.hiddenAt)))
      .groupBy(discussions.docoId),
  ]);

  const out = new Map<string, Activity>();
  const entry = (id: string): Activity => {
    const existing = out.get(id);
    if (existing !== undefined) return existing;
    const fresh = { stamps: 0, threads: 0, replies: 0 };
    out.set(id, fresh);
    return fresh;
  };
  for (const r of stampRows) entry(r.docoId).stamps = r.n;
  for (const r of threadRows) entry(r.docoId).threads = r.n;
  for (const r of replyRows) entry(r.docoId).replies = r.n;
  return out;
}

// drizzle's joined-builder type is unnameable, so the return type stays
// inferred; callers chain .where/.orderBy/.limit on it.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function listedRows() {
  return db
    .select(listedDocoSelection)
    .from(latestVersions)
    .innerJoin(
      docos,
      and(
        eq(docos.id, latestVersions.docoId),
        isNull(docos.deletedAt),
        // Example sandbox docos never appear in trending, fresh, the pool, or events.
        sql`NOT (${latestVersions.kind} <@ ${EXAMPLE_KIND_ROOT}::ltree)`,
      ),
    )
    .innerJoin(projects, eq(projects.id, docos.projectId))
    .innerJoin(orgs, eq(orgs.id, projects.ownerOrgId))
    .leftJoin(gitSources, eq(gitSources.projectId, projects.id));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getBrowseFeed(now: Date = new Date()): Promise<BrowseFeed> {
  // Widen the window honestly instead of padding a quiet week with filler:
  // the UI labels which window it is showing.
  let trendingWindow: TrendingWindow = "week";
  let activity = await activitySince(new Date(now.getTime() - 7 * DAY_MS));
  if (activity.size < MIN_TRENDING) {
    trendingWindow = "month";
    activity = await activitySince(new Date(now.getTime() - 30 * DAY_MS));
  }

  let trending: TrendingDoco[] = [];
  if (activity.size >= MIN_TRENDING) {
    // Resolve EVERY active doco before applying the cutoff: slicing first
    // would let unlistable docos (deleted upstream, deprecated) occupy top
    // slots and then vanish, wrongly forcing the all-time fallback.
    const ranked = [...activity.entries()].sort((a, b) => score(b[1]) - score(a[1]));
    const rows = await listedRows().where(
      inArray(
        latestVersions.docoId,
        ranked.map(([id]) => id),
      ),
    );
    const byId = new Map(rows.map((r) => [r.docoId, r]));
    for (const [id, a] of ranked) {
      if (trending.length >= TRENDING_LIMIT) break;
      const row = byId.get(id);
      // Window activity but no live latest version: drops out of the list.
      if (row === undefined) continue;
      trending.push({
        ...toListedDoco(row),
        windowStamps: a.stamps,
        windowDiscussions: a.threads + a.replies,
      });
    }
  }
  if (trending.length < MIN_TRENDING) {
    // All-time fallback: the best-verified docos, ranked like search ranks
    // them. Activity chips don't apply here; the UI labels the window.
    trendingWindow = "all";
    const rows = await listedRows()
      .orderBy(
        sql`${latestVersions.verificationRankingScore} DESC NULLS LAST`,
        desc(latestVersions.publishedAt),
      )
      .limit(TRENDING_LIMIT);
    trending = rows.map((row) => ({
      ...toListedDoco(row),
      windowStamps: 0,
      windowDiscussions: 0,
    }));
  }

  const trendingIds = trending.map((d) => d.docoId);
  const freshRows = await listedRows()
    .where(trendingIds.length > 0 ? notInArray(latestVersions.docoId, trendingIds) : undefined)
    .orderBy(desc(latestVersions.publishedAt))
    .limit(FRESH_LIMIT);
  const fresh = freshRows.map(toListedDoco);

  // Daily-seeded shuffle: stable for the cache window, rotates without
  // tracking anyone. Seeded in SQL so the page never needs Math.random.
  const shownIds = [...trendingIds, ...fresh.map((d) => d.docoId)];
  const poolRows = await listedRows()
    .where(shownIds.length > 0 ? notInArray(latestVersions.docoId, shownIds) : undefined)
    .orderBy(sql`md5(${latestVersions.docoId}::text || to_char(now(), 'YYYY-MM-DD'))`)
    .limit(POOL_LIMIT);
  const pool = poolRows.map(toListedDoco);

  const events =
    trendingWindow === "all"
      ? []
      : await recentEvents(new Date(now.getTime() - (trendingWindow === "week" ? 7 : 30) * DAY_MS));

  return { trendingWindow, trending, fresh, pool, events };
}

const EVENT_LIMIT = 3;

// The ticker line's raw material: latest stamps and discussion posts in the
// window, resolved to their doco's title + URL. Two timestamp-ordered index
// scans plus one row lookup; actors are never read.
async function recentEvents(since: Date): Promise<BrowseEvent[]> {
  const [stampRows, threadRows, replyRows] = await Promise.all([
    db
      .select({ docoId: versions.docoId, at: stamps.createdAt })
      .from(stamps)
      .innerJoin(versions, eq(versions.id, stamps.versionId))
      .where(gte(stamps.createdAt, since))
      .orderBy(desc(stamps.createdAt))
      .limit(EVENT_LIMIT),
    db
      .select({ docoId: discussions.docoId, at: discussions.createdAt })
      .from(discussions)
      .where(and(gte(discussions.createdAt, since), isNull(discussions.hiddenAt)))
      .orderBy(desc(discussions.createdAt))
      .limit(EVENT_LIMIT),
    db
      .select({ docoId: discussions.docoId, at: discussionReplies.createdAt })
      .from(discussionReplies)
      .innerJoin(discussions, eq(discussions.id, discussionReplies.discussionId))
      .where(and(gte(discussionReplies.createdAt, since), isNull(discussionReplies.hiddenAt)))
      .orderBy(desc(discussionReplies.createdAt))
      .limit(EVENT_LIMIT),
  ]);

  const merged = [
    ...stampRows.map((r) => ({ type: "verified" as const, docoId: r.docoId, at: r.at })),
    ...threadRows.map((r) => ({ type: "discussion" as const, docoId: r.docoId, at: r.at })),
    ...replyRows.map((r) => ({ type: "discussion" as const, docoId: r.docoId, at: r.at })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, EVENT_LIMIT);
  if (merged.length === 0) return [];

  const rows = await listedRows().where(
    inArray(latestVersions.docoId, [...new Set(merged.map((e) => e.docoId))]),
  );
  const byId = new Map(rows.map((r) => [r.docoId, toListedDoco(r)]));
  const events: BrowseEvent[] = [];
  for (const e of merged) {
    const doco = byId.get(e.docoId);
    if (doco === undefined) continue;
    events.push({
      type: e.type,
      docoTitle: doco.title,
      docoHref: doco.href,
      at: e.at.toISOString(),
    });
  }
  return events;
}
