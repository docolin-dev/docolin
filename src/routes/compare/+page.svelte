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
  import { SITE_URL } from "$lib/site";

  // Honest comparison page. Qualitative on purpose (the homepage owns the
  // numbers), and explicit about what docolin lacks. Public marketing surface.
  const pageUrl = $derived(`${SITE_URL}${page.url.pathname}`);
</script>

<svelte:head>
  <title>{m.compare_meta_title()}</title>
  <meta name="description" content={m.compare_meta_description()} />
  <meta property="og:title" content={m.compare_meta_title()} />
  <meta property="og:description" content={m.compare_meta_description()} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:locale" content={getLocale()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={m.compare_meta_title()} />
  <meta name="twitter:description" content={m.compare_meta_description()} />
</svelte:head>

<div class="light bg-background text-foreground flex min-h-screen flex-col">
  <Navbar />
  <main class="flex-grow">
    <!-- Hero -->
    <section class="px-6 pt-32 pb-20 sm:pt-40 sm:pb-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.compare_hero_eyebrow()}
        </p>
        <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {m.compare_hero_title()}
        </h1>
        <p class="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          {m.compare_hero_subtitle()}
        </p>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- What only docolin has -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-5xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.compare_only_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.compare_only_title()}
        </h2>
        <div class="mt-10 grid gap-6 sm:grid-cols-2">
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <ShieldCheck class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.compare_only_verify_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.compare_only_verify_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <Scale class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.compare_only_open_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.compare_only_open_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <AtSign class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.compare_only_attribution_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.compare_only_attribution_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <Layers class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.compare_only_version_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.compare_only_version_body()}
            </p>
          </div>
        </div>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- Against the field -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-5xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.compare_cat_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.compare_cat_title()}
        </h2>
        <div class="mt-10 grid gap-6 sm:grid-cols-3">
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <h3 class="text-foreground text-lg font-medium tracking-tight">
              {m.compare_cat_ai_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.compare_cat_ai_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <h3 class="text-foreground text-lg font-medium tracking-tight">
              {m.compare_cat_platforms_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.compare_cat_platforms_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <h3 class="text-foreground text-lg font-medium tracking-tight">
              {m.compare_cat_community_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.compare_cat_community_body()}
            </p>
          </div>
        </div>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- What we lack -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.compare_lack_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.compare_lack_title()}
        </h2>
        <p class="text-muted-foreground mt-6 text-lg leading-relaxed">{m.compare_lack_body()}</p>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- Close -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.compare_cta_title()}
        </h2>
        <div class="mt-10 flex flex-wrap gap-3">
          <Button href={localizeHref("/browse")} size="lg" class="group h-11 gap-2 px-5">
            {m.compare_cta_primary()}
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
          <Button href={localizeHref("/about")} variant="outline" size="lg" class="h-11 px-5">
            {m.compare_cta_secondary()}
          </Button>
        </div>
      </div>
    </section>
  </main>
  <Footer />
</div>
