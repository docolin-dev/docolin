<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import McpHero from "$lib/components/mcp/McpHero.svelte";
  import McpDemo from "$lib/components/mcp/McpDemo.svelte";
  import McpPillars from "$lib/components/mcp/McpPillars.svelte";
  import McpConnect from "$lib/components/mcp/McpConnect.svelte";
  import McpTools from "$lib/components/mcp/McpTools.svelte";
  import { SITE_URL } from "$lib/site";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const pageUrl = $derived(`${SITE_URL}${page.url.pathname}`);

  // HowTo structured data over the connect steps: the highest-value rich-result
  // surface on this page. Steps are derived from the same messages the section
  // renders, so the markup and the structured data never drift.
  const howToJsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: m.mcp_landing_howto_name(),
    description: m.mcp_landing_meta_description(),
    inLanguage: getLocale(),
    step: [
      {
        "@type": "HowToStep",
        name: m.mcp_landing_connect_step1_title(),
        text: m.mcp_landing_connect_step1_body(),
      },
      {
        "@type": "HowToStep",
        name: m.mcp_landing_connect_step2_title(),
        text: m.mcp_landing_connect_step2_body(),
      },
      {
        "@type": "HowToStep",
        name: m.mcp_landing_connect_step3_title(),
        text: m.mcp_landing_connect_step3_body(),
      },
    ],
  });

  /* eslint-disable no-useless-escape */
  const howToJsonLdHtml = $derived(
    `<script type="application/ld+json">${JSON.stringify(howToJsonLd)}<\/script>`,
  );
  /* eslint-enable no-useless-escape */
</script>

<svelte:head>
  <title>{m.mcp_landing_meta_title()}</title>
  <meta name="description" content={m.mcp_landing_meta_description()} />
  <meta property="og:title" content={m.mcp_landing_meta_title()} />
  <meta property="og:description" content={m.mcp_landing_meta_description()} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:locale" content={getLocale()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={m.mcp_landing_meta_title()} />
  <meta name="twitter:description" content={m.mcp_landing_meta_description()} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html howToJsonLdHtml}
</svelte:head>

<div class="bg-background text-foreground flex min-h-screen flex-col">
  <Navbar />
  <main class="flex-grow">
    <McpHero endpoint={data.endpoint} />
    <McpDemo />
    <McpPillars />
    <McpConnect endpoint={data.endpoint} />
    <McpTools />
  </main>
  <Footer />
</div>
