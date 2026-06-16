<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import Navbar from "$lib/components/Navbar.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { SITE_URL, SITE_SUPPORT_EMAIL } from "$lib/site";

  // Plain-English terms of use. A public marketing surface; themes light + dark.
  const pageUrl = $derived(`${SITE_URL}${page.url.pathname}`);
</script>

<svelte:head>
  <title>{m.terms_meta_title()}</title>
  <meta name="description" content={m.terms_meta_description()} />
  <meta property="og:title" content={m.terms_meta_title()} />
  <meta property="og:description" content={m.terms_meta_description()} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:locale" content={getLocale()} />
</svelte:head>

<div class="bg-background text-foreground flex min-h-screen flex-col">
  <Navbar />
  <main class="flex-grow">
    <!-- Hero -->
    <section class="px-6 pt-32 pb-12 sm:pt-40">
      <div class="mx-auto max-w-3xl">
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.terms_hero_eyebrow()}
        </p>
        <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {m.terms_hero_title()}
        </h1>
        <p class="text-muted-foreground mt-4 text-sm">{m.terms_hero_updated()}</p>
      </div>
    </section>

    <div class="px-6"><hr class="border-foreground/10 mx-auto max-w-3xl" /></div>

    <!-- Body -->
    <section class="px-6 py-16 sm:py-20">
      <div class="mx-auto max-w-3xl space-y-10">
        <div>
          <h2 class="text-foreground text-xl font-semibold tracking-tight">
            {m.terms_use_title()}
          </h2>
          <p class="text-muted-foreground mt-3 leading-relaxed">{m.terms_use_body()}</p>
        </div>
        <div>
          <h2 class="text-foreground text-xl font-semibold tracking-tight">
            {m.terms_content_title()}
          </h2>
          <p class="text-muted-foreground mt-3 leading-relaxed">{m.terms_content_body()}</p>
        </div>
        <div>
          <h2 class="text-foreground text-xl font-semibold tracking-tight">
            {m.terms_license_title()}
          </h2>
          <p class="text-muted-foreground mt-3 leading-relaxed">{m.terms_license_body()}</p>
        </div>
        <div>
          <h2 class="text-foreground text-xl font-semibold tracking-tight">
            {m.terms_verification_title()}
          </h2>
          <p class="text-muted-foreground mt-3 leading-relaxed">{m.terms_verification_body()}</p>
        </div>
        <div>
          <h2 class="text-foreground text-xl font-semibold tracking-tight">
            {m.terms_changes_title()}
          </h2>
          <p class="text-muted-foreground mt-3 leading-relaxed">{m.terms_changes_body()}</p>
        </div>
        <div>
          <h2 class="text-foreground text-xl font-semibold tracking-tight">
            {m.terms_contact_title()}
          </h2>
          <p class="text-muted-foreground mt-3 leading-relaxed">
            {m.terms_contact_body()}
            <a
              href={`mailto:${SITE_SUPPORT_EMAIL}`}
              class="text-primary font-medium hover:underline">{m.terms_contact_link()}</a
            >
          </p>
        </div>
      </div>
    </section>
  </main>
  <Footer />
</div>
