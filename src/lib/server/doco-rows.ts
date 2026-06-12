import { docos, gitSources, latestVersions, orgs, projects } from "$lib/server/db/schema";
import { fromLtree } from "$lib/server/db/schema/types";
import { pathFromSourcePath } from "$lib/doco-urls";

// Shared shape for "a doco in a list" (profiles, browse). The join is short
// enough to stay inline at each query (latest_versions -> docos -> projects ->
// orgs, left gitSources for the subpath), but the selection and the mapper are
// shared so every list row carries identical fields and URL building never
// diverges.

export const listedDocoSelection = {
  docoId: latestVersions.docoId,
  title: latestVersions.title,
  description: latestVersions.description,
  kind: latestVersions.kind,
  pangoScore: latestVersions.verificationScore,
  stampCount: latestVersions.verificationStampCount,
  publishedAt: latestVersions.publishedAt,
  appliesTo: latestVersions.appliesTo,
  pathInSource: docos.pathInSource,
  subpath: gitSources.subpath,
  orgSlug: orgs.slug,
  projectSlug: projects.slug,
  projectDisplayName: projects.displayName,
};

export interface ListedDocoRow {
  docoId: string;
  title: string;
  description: string | null;
  kind: string;
  pangoScore: number | null;
  stampCount: number;
  publishedAt: Date;
  appliesTo: string[];
  pathInSource: string | null;
  subpath: string | null;
  orgSlug: string;
  projectSlug: string;
  projectDisplayName: string | null;
}

export interface ListedDoco {
  docoId: string;
  title: string;
  description: string | null;
  href: string;
  kind: string;
  pangoScore: number | null;
  stampCount: number;
  publishedAt: string;
  projectLabel: string;
  appliesTo: string[];
}

export function toListedDoco(row: ListedDocoRow): ListedDoco {
  const path = pathFromSourcePath(row.pathInSource ?? "", row.subpath);
  return {
    docoId: row.docoId,
    title: row.title,
    description: row.description,
    href: `/${row.orgSlug}/${row.projectSlug}/${path}`,
    kind: fromLtree(row.kind),
    pangoScore: row.pangoScore,
    stampCount: row.stampCount,
    publishedAt: row.publishedAt.toISOString(),
    projectLabel: row.projectDisplayName ?? row.projectSlug,
    appliesTo: row.appliesTo,
  };
}
