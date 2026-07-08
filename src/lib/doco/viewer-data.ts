import type { TocEntry } from "$lib/markdown/render";

// The data contract for the doco viewer, shared so the live route's server
// load, the dev playground, the DocoView component, and the local-folder
// preview all agree on one shape. Pure types only (no runtime), so it is safe
// to import from both server and client code.

// Author attribution resolved for display: a docolin user (links to their
// profile) or external attribution (name + optional url). A `deleted` user is a
// tombstoned account: its handle and displayName are blanked here (defence in
// depth) and renderers show "deleted account" with no profile link.
export type ResolvedAuthor =
  | { kind: "user"; userId: string; handle: string; displayName: string | null; deleted: boolean }
  | { kind: "external"; name: string; username: string | null; url: string | null };

// Rich prev/next nav target. Resolved entries carry the destination's title
// and kind so the card renders real content; raw entries fall back to the
// original link string when resolution fails (external, soft kind, or
// cross-project links).
export type ResolvedNavLink =
  | { kind: "resolved"; title: string; kindPath: string; href: string }
  | { kind: "raw"; href: string };

// One earlier version, for the version dropdown.
export interface DocoVersionSummary {
  versionNumber: number;
  commitSha: string | null;
  versionTag: string | null;
  publishedAt: string;
  verifiedCount: number;
  pangoScore: number | null;
}

// The doco payload the viewer renders.
export interface DocoViewDoco {
  id: string;
  versionId: string;
  title: string;
  description: string | null;
  kind: string;
  type: "tutorial" | "how-to" | "reference" | "explanation";
  status: "draft" | "stable" | "needs-update" | "deprecated";
  difficulty: "beginner" | "intermediate" | "advanced" | "expert" | null;
  timeEstimateMinMinutes: number | null;
  timeEstimateMaxMinutes: number | null;
  language: string;
  appliesTo: string[];
  deletedAt: string | null;
  bodyText: string;
  bodyHtml: string;
  toc: TocEntry[];
  readingMinutes: number;
  prevNav: ResolvedNavLink | null;
  nextNav: ResolvedNavLink | null;
  sitemap: unknown;
  authors: ResolvedAuthor[];
  verifiedCount: number;
  pangoScore: number | null;
  lastConfirmedAt: string | null;
  versionNumber: number;
  commitSha: string | null;
  versionTag: string | null;
  pathFromProjectRoot: string;
  publishedAt: string;
  versions: DocoVersionSummary[];
}

export interface DocoViewData {
  // True for the dev markdown playground (no DB row behind it): the viewer
  // skips every doco-id-keyed API call.
  playground: boolean;
  org: { slug: string; displayName: string | null };
  project: { slug: string; displayName: string | null };
  gitSource: { repoUrl: string; defaultBranch: string };
  pathInSource: string | null;
  doco: DocoViewDoco;
  // Meta description for the page head: the frontmatter `description` when set,
  // otherwise a plain-text excerpt derived from the body (see the route load).
  // Optional so the dev playground and local preview, which set their own head,
  // can omit it; the route falls back to `doco.description` when absent.
  metaDescription?: string | null;
}
