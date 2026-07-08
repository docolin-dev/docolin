<script lang="ts">
  import { page } from "$app/state";
  import { localizeHref } from "$paraglide/runtime";
  import { SITE_URL } from "$lib/site";
  import { ldJsonScript } from "$lib/ld-json";
  import { labelForSegment } from "$lib/components/search/kind-tree";
  import DocoView from "$lib/components/doco/DocoView.svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const doco = $derived(data.doco);

  // Example-sandbox docos (kind under `example/`) are served at their URL but
  // kept out of search engines, mirroring their exclusion from on-site search
  // and browse. The literal matches EXAMPLE_KIND_ROOT in frontmatter-schema,
  // kept inline so the zod-heavy schema module stays out of the client bundle.
  const noindex = $derived(doco.kind.split("/")[0] === "example");

  // SEO surface: every doco page is a landing page. The canonical always
  // points at the unversioned URL (per locale), so pinned @version views
  // consolidate their ranking onto the living doco. Kept in the route (not the
  // shared DocoView) so other surfaces that render DocoView, like the local
  // preview, set their own head (e.g. noindex) instead.
  const canonicalUrl = $derived(
    `${SITE_URL}${localizeHref(`/${data.org.slug}/${data.project.slug}/${doco.pathFromProjectRoot}`)}`,
  );

  // The frontmatter description, or a body-derived excerpt when the author left
  // it blank (server-computed, see the load). Falls back to doco.description for
  // surfaces that reuse this route's data without setting metaDescription.
  const metaDescription = $derived(data.metaDescription ?? doco.description);

  // Version dates: the list is newest-first, so the last entry is the original
  // publish and the currently shown version's date is the last modification.
  const originalPublishedAt = $derived(
    doco.versions.length > 0
      ? doco.versions[doco.versions.length - 1].publishedAt
      : doco.publishedAt,
  );

  // Kind taxonomy segments, shared by the article's section label and the
  // breadcrumb trail below.
  const kindSegments = $derived(doco.kind.split("/").filter((segment) => segment.length > 0));

  const articleJsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: doco.title,
    ...(metaDescription ? { description: metaDescription } : {}),
    inLanguage: doco.language,
    datePublished: originalPublishedAt,
    dateModified: doco.publishedAt,
    // The systems this doco is confirmed for, plus its section (the human-
    // readable label of the deepest kind segment), give crawlers topical
    // context beyond the free-text body. schema.org wants a section name here,
    // not the raw slash path.
    ...(kindSegments.length > 0
      ? { articleSection: labelForSegment(kindSegments[kindSegments.length - 1]) }
      : {}),
    ...(doco.appliesTo.length > 0 ? { keywords: doco.appliesTo.join(", ") } : {}),
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    author: doco.authors.map((a) =>
      a.kind === "user" && a.deleted
        ? { "@type": "Person", name: "deleted account" }
        : a.kind === "user"
          ? { "@type": "Person", name: a.displayName ?? a.handle, url: `${SITE_URL}/${a.handle}` }
          : { "@type": "Person", name: a.name, ...(a.url === null ? {} : { url: a.url }) },
    ),
    publisher: { "@type": "Organization", name: "docolin", url: SITE_URL },
  });
  const articleJsonLdHtml = $derived(ldJsonScript(articleJsonLd));

  // Breadcrumb trail following the kind taxonomy (docolin > os > linux > ...),
  // each segment a real, indexable kind browse page, ending at this doco. Gives
  // search engines the hierarchy the URL alone (org/project) doesn't express.
  const breadcrumbJsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "docolin",
        item: `${SITE_URL}${localizeHref("/")}`,
      },
      ...kindSegments.map((segment, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: labelForSegment(segment),
        item: `${SITE_URL}${localizeHref(`/${kindSegments.slice(0, i + 1).join("/")}`)}`,
      })),
      {
        "@type": "ListItem",
        position: kindSegments.length + 2,
        name: doco.title,
        item: canonicalUrl,
      },
    ],
  });
  const breadcrumbJsonLdHtml = $derived(ldJsonScript(breadcrumbJsonLd));

  // The canonicalized markdown endpoint, built from the route params so a
  // pinned @version carries through. Handed to DocoView, which shares it
  // between the copy-markdown button and the "View raw markdown" menu item.
  const rawHref = $derived(
    `/raw/${page.params.org ?? ""}/${page.params.project ?? ""}/${page.params.path ?? ""}`,
  );
</script>

<svelte:head>
  <title>{doco.title} · {data.project.displayName ?? data.project.slug} · docolin</title>
  {#if metaDescription}
    <meta name="description" content={metaDescription} />
    <meta property="og:description" content={metaDescription} />
  {/if}
  <link rel="canonical" href={canonicalUrl} />
  {#if noindex}
    <meta name="robots" content="noindex, nofollow" />
  {/if}
  <meta property="og:title" content={doco.title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:site_name" content="docolin" />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify of our own data, `<` escaped in ldJsonScript -->
  {@html articleJsonLdHtml}
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify of our own data, `<` escaped in ldJsonScript -->
  {@html breadcrumbJsonLdHtml}
</svelte:head>

<DocoView {data} {rawHref} />
