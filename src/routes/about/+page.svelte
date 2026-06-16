<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { Button } from "$lib/components/ui/button";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import Scale from "@lucide/svelte/icons/scale";
  import AtSign from "@lucide/svelte/icons/at-sign";
  import Layers from "@lucide/svelte/icons/layers";
  import pangolin320 from "$lib/assets/pangolin-sitting-320.webp";
  import pangolin640 from "$lib/assets/pangolin-sitting-640.webp";
  import { SITE_NAME, SITE_URL, SITE_REPO } from "$lib/site";

  // The "why docolin exists" narrative. A public marketing surface that themes
  // light + dark like the rest of the site (the Navbar carries the toggle).

  const pageUrl = $derived(`${SITE_URL}${page.url.pathname}`);

  // Organization structured data: the about page is the natural home for the
  // knowledge-panel signal (name, description, canonical URL, repo).
  const orgJsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description: m.about_meta_description(),
    sameAs: [SITE_REPO],
  });
  /* eslint-disable no-useless-escape */
  const orgJsonLdHtml = $derived(
    `<script type="application/ld+json">${JSON.stringify(orgJsonLd)}<\/script>`,
  );
  /* eslint-enable no-useless-escape */
</script>

<svelte:head>
  <title>{m.about_meta_title()}</title>
  <meta name="description" content={m.about_meta_description()} />
  <meta property="og:title" content={m.about_meta_title()} />
  <meta property="og:description" content={m.about_meta_description()} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:locale" content={getLocale()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={m.about_meta_title()} />
  <meta name="twitter:description" content={m.about_meta_description()} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html orgJsonLdHtml}
</svelte:head>

<div class="bg-background text-foreground flex min-h-screen flex-col">
  <Navbar />
  <main class="flex-grow">
    <!-- Hero -->
    <section class="px-6 pt-32 pb-20 sm:pt-40 sm:pb-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.about_hero_eyebrow()}
        </p>
        <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {m.about_hero_title()}
        </h1>
        <p class="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          {m.about_hero_subtitle()}
        </p>
        <div class="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button href={localizeHref("/browse")} size="lg" class="group h-11 gap-2 px-5">
            {m.about_hero_cta_browse()}
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
          <Button href={localizeHref("/mcp")} variant="outline" size="lg" class="h-11 gap-2 px-5">
            {m.about_hero_cta_mcp()}
          </Button>
        </div>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- The problem -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.about_thesis_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.about_thesis_title()}
        </h2>
        <p class="text-muted-foreground mt-6 text-lg leading-relaxed">{m.about_thesis_body()}</p>

        <div class="mt-10 grid gap-6 sm:grid-cols-2">
          <div class="border-foreground/12 bg-card border p-6">
            <h3 class="text-foreground text-lg font-medium tracking-tight">
              {m.about_thesis_machine_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.about_thesis_machine_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card border p-6">
            <h3 class="text-foreground text-lg font-medium tracking-tight">
              {m.about_thesis_human_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.about_thesis_human_body()}
            </p>
          </div>
        </div>
        <p class="text-foreground mt-8 max-w-2xl text-base leading-relaxed">
          {m.about_thesis_close()}
        </p>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- What makes it different -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-5xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.about_different_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.about_different_title()}
        </h2>

        <div class="mt-10 grid gap-6 sm:grid-cols-2">
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <ShieldCheck class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.about_different_verify_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.about_different_verify_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <Scale class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.about_different_open_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.about_different_open_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <AtSign class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.about_different_attribution_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.about_different_attribution_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <Layers class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.about_different_resolution_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.about_different_resolution_body()}
            </p>
          </div>
        </div>

        <a
          href={localizeHref("/compare")}
          class="text-primary mt-8 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          {m.about_different_compare_link()}
          <ArrowRight class="size-4" />
        </a>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- Owned by no one -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.about_open_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.about_open_title()}
        </h2>
        <p class="text-muted-foreground mt-6 text-lg leading-relaxed">{m.about_open_body()}</p>
        <p class="text-foreground mt-6 text-base leading-relaxed">{m.about_open_governance()}</p>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- The launch wedge -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.about_wedge_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.about_wedge_title()}
        </h2>
        <p class="text-muted-foreground mt-6 text-lg leading-relaxed">{m.about_wedge_body()}</p>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- What it is not -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.about_not_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.about_not_title()}
        </h2>
        <ul class="text-muted-foreground mt-8 space-y-3 text-base leading-relaxed">
          <li>{m.about_not_additive()}</li>
          <li>{m.about_not_competitor()}</li>
          <li>{m.about_not_training()}</li>
        </ul>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- Pango + get involved -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <div
          class="border-foreground/12 bg-card mb-12 flex flex-col gap-6 border p-6 sm:flex-row sm:items-center"
        >
          <picture class="shrink-0">
            <source media="(min-width: 768px)" srcset={pangolin640} />
            <img
              src={pangolin320}
              alt={m.about_pango_alt()}
              width="320"
              height="320"
              class="mx-auto h-32 w-auto select-none sm:mx-0 sm:h-40"
              decoding="async"
              loading="lazy"
            />
          </picture>
          <div>
            <h3 class="text-foreground text-lg font-medium tracking-tight">
              {m.about_pango_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-base leading-relaxed">
              {m.about_pango_body()}
            </p>
          </div>
        </div>

        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.about_involved_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.about_involved_title()}
        </h2>
        <p class="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          {m.about_involved_body()}
        </p>
        <!-- A reader who scrolled this far is in learning mode, so the bottom
             leads with the read path (Browse), which is also the body's first
             "way to help": read a guide and stamp whether it worked. The
             maintainer path follows; sponsor + GitHub stay reachable in the footer. -->
        <div class="mt-10 flex flex-wrap gap-3">
          <Button href={localizeHref("/browse")} size="lg" class="group h-11 gap-2 px-5">
            {m.about_hero_cta_browse()}
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
          <Button
            href={localizeHref("/for-projects")}
            variant="outline"
            size="lg"
            class="h-11 px-5"
          >
            {m.about_involved_cta_projects()}
          </Button>
        </div>
      </div>
    </section>
  </main>
  <Footer />
</div>
