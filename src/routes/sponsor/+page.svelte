<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { Button } from "$lib/components/ui/button";
  import Mail from "@lucide/svelte/icons/mail";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import { SITE_URL, SITE_CONTACT_EMAIL } from "$lib/site";

  // The "how docolin is funded" page. Replaces a pricing page (there is none).
  // Public marketing surface: light chrome.
  const pageUrl = $derived(`${SITE_URL}${page.url.pathname}`);
</script>

<svelte:head>
  <title>{m.sponsor_meta_title()}</title>
  <meta name="description" content={m.sponsor_meta_description()} />
  <meta property="og:title" content={m.sponsor_meta_title()} />
  <meta property="og:description" content={m.sponsor_meta_description()} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:locale" content={getLocale()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={m.sponsor_meta_title()} />
  <meta name="twitter:description" content={m.sponsor_meta_description()} />
</svelte:head>

<div class="light bg-background text-foreground flex min-h-screen flex-col">
  <Navbar />
  <main class="flex-grow">
    <!-- Hero -->
    <section class="px-6 pt-32 pb-20 sm:pt-40 sm:pb-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.sponsor_hero_eyebrow()}
        </p>
        <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {m.sponsor_hero_title()}
        </h1>
        <p class="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          {m.sponsor_hero_subtitle()}
        </p>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- The model -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.sponsor_model_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.sponsor_model_title()}
        </h2>
        <p class="text-muted-foreground mt-6 text-lg leading-relaxed">{m.sponsor_model_body()}</p>

        <!-- The guardrail: load-bearing for trust, so it gets the visual emphasis. -->
        <div class="border-primary/30 bg-primary/5 mt-10 border border-l-4 p-6">
          <div class="flex items-center gap-2">
            <ShieldCheck class="text-primary size-5" />
            <h3 class="text-foreground text-lg font-medium tracking-tight">
              {m.sponsor_guardrail_title()}
            </h3>
          </div>
          <p class="text-foreground/80 mt-3 text-base leading-relaxed">
            {m.sponsor_guardrail_body()}
          </p>
        </div>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- Who we're looking for -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.sponsor_who_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.sponsor_who_title()}
        </h2>
        <p class="text-muted-foreground mt-6 text-lg leading-relaxed">{m.sponsor_who_body()}</p>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- Close -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.sponsor_cta_title()}
        </h2>
        <p class="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          {m.sponsor_cta_body()}
        </p>
        <div class="mt-10 flex flex-wrap gap-3">
          <Button href={`mailto:${SITE_CONTACT_EMAIL}`} size="lg" class="h-11 gap-2 px-5">
            <Mail class="size-4" />
            {m.sponsor_cta_primary()}
          </Button>
          <Button href={localizeHref("/about")} variant="outline" size="lg" class="h-11 px-5">
            {m.sponsor_cta_secondary()}
          </Button>
        </div>
      </div>
    </section>
  </main>
  <Footer />
</div>
