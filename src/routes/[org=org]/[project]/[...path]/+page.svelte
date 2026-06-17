<script lang="ts">
  import { page } from "$app/state";
  import { localizeHref } from "$paraglide/runtime";
  import { SITE_URL } from "$lib/site";
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
  const articleJsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: doco.title,
    ...(doco.description === null ? {} : { description: doco.description }),
    inLanguage: doco.language,
    datePublished: doco.publishedAt,
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
    author: doco.authors.map((a) =>
      a.kind === "user"
        ? { "@type": "Person", name: a.displayName ?? a.handle, url: `${SITE_URL}/${a.handle}` }
        : { "@type": "Person", name: a.name, ...(a.url === null ? {} : { url: a.url }) },
    ),
    publisher: { "@type": "Organization", name: "docolin", url: SITE_URL },
  });
  // Title/description/author names are user content; escape `<` so they can
  // never close the script tag.
  /* eslint-disable no-useless-escape */
  const articleJsonLdHtml = $derived(
    `<script type="application/ld+json">${JSON.stringify(articleJsonLd).split("<").join("\\u003c")}<\/script>`,
  );
  /* eslint-enable no-useless-escape */

  // The canonicalized markdown endpoint, built from the route params so a
  // pinned @version carries through. Handed to DocoView, which shares it
  // between the copy-markdown button and the "View raw markdown" menu item.
  const rawHref = $derived(
    `/raw/${page.params.org ?? ""}/${page.params.project ?? ""}/${page.params.path ?? ""}`,
  );
</script>

<svelte:head>
  <title>{doco.title} · {data.project.displayName ?? data.project.slug} · docolin</title>
  {#if doco.description}
    <meta name="description" content={doco.description} />
    <meta property="og:description" content={doco.description} />
  {/if}
  <link rel="canonical" href={canonicalUrl} />
  {#if noindex}
    <meta name="robots" content="noindex, nofollow" />
  {/if}
  <meta property="og:title" content={doco.title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:site_name" content="docolin" />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify of our own data, `<` escaped above -->
  {@html articleJsonLdHtml}
</svelte:head>

<DocoView {data} {rawHref} />
