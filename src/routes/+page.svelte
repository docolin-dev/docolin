<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import Hero from "$lib/components/home/Hero.svelte";
  import { HOME_SEARCH_INPUT_ID } from "$lib/constants/home";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import Pillars from "$lib/components/home/Pillars.svelte";
  import SearchDuet from "$lib/components/home/SearchDuet.svelte";
  import Personas from "$lib/components/home/Personas.svelte";
  import WhyStats from "$lib/components/home/WhyStats.svelte";
  import StatusProgress from "$lib/components/home/StatusProgress.svelte";
  import {
    SITE_NAME,
    SITE_URL,
    SITE_REPO,
    SITE_AUTHOR,
    SITE_AUTHOR_URL,
    SITE_LICENSE,
  } from "$lib/site";

  $effect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        const input = document.getElementById(HOME_SEARCH_INPUT_ID);
        if (input instanceof HTMLInputElement) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  const pageUrl = $derived(`${SITE_URL}${page.url.pathname}`);

  const websiteJsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: pageUrl,
    description: m.home_meta_description(),
    inLanguage: getLocale(),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      sameAs: [SITE_REPO, SITE_AUTHOR_URL],
      founder: { "@type": "Person", name: SITE_AUTHOR, url: SITE_AUTHOR_URL },
    },
    license: SITE_LICENSE,
  });

  /* eslint-disable no-useless-escape */
  const websiteJsonLdHtml = $derived(
    `<script type="application/ld+json">${JSON.stringify(websiteJsonLd)}<\/script>`,
  );
  /* eslint-enable no-useless-escape */
</script>

<svelte:head>
  <title>{m.home_meta_title()}</title>
  <meta name="description" content={m.home_meta_description()} />
  <meta property="og:title" content={m.home_meta_title()} />
  <meta property="og:description" content={m.home_meta_description()} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:locale" content={getLocale()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={m.home_meta_title()} />
  <meta name="twitter:description" content={m.home_meta_description()} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html websiteJsonLdHtml}
</svelte:head>

<div class="bg-background text-foreground flex min-h-screen flex-col">
  <Navbar />

  <main class="flex-grow">
    <Hero />
    <Pillars />
    <hr class="border-foreground/10 mx-auto w-3/5" aria-hidden="true" />
    <SearchDuet />
    <hr class="border-foreground/10 mx-auto w-3/5" aria-hidden="true" />
    <Personas />
    <hr class="border-foreground/10 mx-auto w-3/5" aria-hidden="true" />
    <WhyStats />
    <hr class="border-foreground/10 mx-auto w-3/5" aria-hidden="true" />
    <StatusProgress />
  </main>

  <Footer />
</div>
