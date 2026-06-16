<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { Button } from "$lib/components/ui/button";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import Download from "@lucide/svelte/icons/download";
  import PencilLine from "@lucide/svelte/icons/pencil-line";
  import GitMerge from "@lucide/svelte/icons/git-merge";
  import AtSign from "@lucide/svelte/icons/at-sign";
  import History from "@lucide/svelte/icons/history";
  import { SITE_URL, SITE_REPO } from "$lib/site";

  // The maintainer pitch. Public marketing surface: light chrome, themed
  // experience begins inside the app.
  const pageUrl = $derived(`${SITE_URL}${page.url.pathname}`);
</script>

<svelte:head>
  <title>{m.projects_meta_title()}</title>
  <meta name="description" content={m.projects_meta_description()} />
  <meta property="og:title" content={m.projects_meta_title()} />
  <meta property="og:description" content={m.projects_meta_description()} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:locale" content={getLocale()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={m.projects_meta_title()} />
  <meta name="twitter:description" content={m.projects_meta_description()} />
</svelte:head>

<div class="light bg-background text-foreground flex min-h-screen flex-col">
  <Navbar />
  <main class="flex-grow">
    <!-- Hero -->
    <section class="px-6 pt-32 pb-20 sm:pt-40 sm:pb-24">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.projects_hero_eyebrow()}
        </p>
        <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {m.projects_hero_title()}
        </h1>
        <p class="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          {m.projects_hero_subtitle()}
        </p>
        <div class="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button href={localizeHref("/dashboard")} size="lg" class="group h-11 gap-2 px-5">
            {m.projects_hero_cta_primary()}
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
          <Button href="#how" variant="outline" size="lg" class="h-11 px-5">
            {m.projects_hero_cta_secondary()}
          </Button>
        </div>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- How docs get in -->
    <section id="how" class="scroll-mt-24 px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-5xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.projects_how_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.projects_how_title()}
        </h2>
        <div class="mt-10 grid gap-6 sm:grid-cols-3">
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <GitBranch class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.projects_how_git_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.projects_how_git_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <Download class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.projects_how_import_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.projects_how_import_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <PencilLine class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.projects_how_editor_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.projects_how_editor_body()}
            </p>
          </div>
        </div>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- What stays yours -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-5xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.projects_keep_eyebrow()}
        </p>
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.projects_keep_title()}
        </h2>
        <div class="mt-10 grid gap-6 sm:grid-cols-3">
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <GitMerge class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.projects_keep_control_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.projects_keep_control_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <AtSign class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.projects_keep_attribution_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.projects_keep_attribution_body()}
            </p>
          </div>
          <div class="border-foreground/12 bg-card flex flex-col border p-6">
            <History class="text-primary size-5" />
            <h3 class="text-foreground mt-4 text-lg font-medium tracking-tight">
              {m.projects_keep_history_title()}
            </h3>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
              {m.projects_keep_history_body()}
            </p>
          </div>
        </div>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- Close -->
    <section class="px-6 py-20 sm:py-24">
      <div class="mx-auto max-w-3xl">
        <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {m.projects_cta_title()}
        </h2>
        <p class="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          {m.projects_cta_body()}
        </p>
        <div class="mt-10 flex flex-wrap gap-3">
          <Button href={localizeHref("/dashboard")} size="lg" class="group h-11 gap-2 px-5">
            {m.projects_cta_primary()}
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
          <Button
            href={SITE_REPO}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="lg"
            class="h-11 px-5"
          >
            {m.projects_cta_github()}
          </Button>
        </div>
      </div>
    </section>
  </main>
  <Footer />
</div>
