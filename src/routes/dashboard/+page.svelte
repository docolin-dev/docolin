<script lang="ts">
  import { m } from "$paraglide/messages";
  import { Button } from "$lib/components/ui/button";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Plus from "@lucide/svelte/icons/plus";
  import pangolin320 from "$lib/assets/pangolin-sitting-320.webp";
  import pangolin640 from "$lib/assets/pangolin-sitting-640.webp";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  // First-time state: exactly one org (the personal one) with no projects.
  // Welcome strip auto-dismisses when content exists.
  const isFirstTime = $derived(data.orgs.length === 1 && data.orgs[0].projectCount === 0);
  const personalOrg = $derived(data.orgs.find((o) => o.isPersonal) ?? data.orgs[0]);

  function projectCountLabel(n: number): string {
    if (n === 0) return m.dashboard_org_card_projects_zero();
    if (n === 1) return m.dashboard_org_card_projects_one();
    return m.dashboard_org_card_projects_many({ count: n.toString() });
  }
</script>

<svelte:head>
  <title>{m.dashboard_meta_title()}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl">
  {#if isFirstTime}
    <!-- Welcome strip: pangolin for warmth, primary-tinted left border ribbon
         marks it as branded surface (theme token, not a hardcoded fill).
         Primary CTA inside makes the next user action explicit. -->
    <div
      class="border-primary/40 bg-muted mb-12 grid grid-cols-1 items-center gap-6 border border-l-4 p-6 sm:grid-cols-[auto_1fr] sm:gap-10 sm:p-8"
    >
      <picture class="mx-auto sm:mx-0">
        <source media="(min-width: 768px)" srcset={pangolin640} />
        <img
          src={pangolin320}
          alt={m.dashboard_pangolin_alt()}
          width="320"
          height="320"
          class="h-32 w-auto [filter:drop-shadow(0_12px_24px_rgb(0_0_0_/_0.15))] select-none sm:h-44 md:h-48"
          decoding="async"
        />
      </picture>
      <div>
        <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
          {m.dashboard_welcome_strip_eyebrow()}
        </p>
        <h2 class="text-foreground text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {m.dashboard_welcome_strip_title()}
        </h2>
        <p class="text-foreground/80 mt-3 max-w-xl text-base leading-relaxed">
          {m.dashboard_welcome_strip_body()}
        </p>
        {#if personalOrg}
          <div class="mt-6">
            <Button
              href="/dashboard/{personalOrg.slug}"
              size="lg"
              class="group h-11 gap-2 px-5 text-base"
            >
              {m.dashboard_welcome_strip_cta()}
              <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="mb-8">
    <h1 class="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
      {m.dashboard_orgs_heading()}
    </h1>
  </div>

  <!-- All cards share an idle surface + border treatment; hover shifts the
       border to primary and slides the arrow. Personal identity is carried
       by the badge + natural sort-first position, not by a ribbon. -->
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
    {#each data.orgs as org (org.id)}
      <a
        href="/dashboard/{org.slug}"
        class="bg-background border-foreground/15 hover:border-primary group flex flex-col border p-6 transition-colors sm:p-7"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <span class="text-muted-foreground truncate font-mono text-sm">{org.slug}</span>
          <span
            class="text-muted-foreground border-border inline-block shrink-0 border px-2 py-0.5 font-mono text-xs tracking-tight uppercase"
          >
            {org.isPersonal ? m.dashboard_org_badge_personal() : m.dashboard_org_badge_org()}
          </span>
        </div>
        <h3 class="text-foreground text-xl font-medium tracking-tight">
          {org.displayName ?? org.slug}
        </h3>
        <div
          class="text-muted-foreground mt-auto flex items-center justify-between gap-3 pt-6 text-sm"
        >
          <span>{projectCountLabel(org.projectCount)}</span>
          <ArrowRight
            class="text-muted-foreground/50 group-hover:text-primary size-4 transition-all group-hover:translate-x-0.5"
          />
        </div>
      </a>
    {/each}

    <!-- New-org card: same surface as existing cards, dashed 2px border
         differentiates "create" from "open." Hover matches the existing
         cards' border shift to keep one hover language across the grid. -->
    <a
      href="/dashboard/orgs/new"
      class="bg-background border-foreground/30 hover:border-primary group flex flex-col items-center justify-center gap-3 border-2 border-dashed p-6 text-center transition-colors sm:p-7"
    >
      <span
        class="bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary inline-flex size-10 items-center justify-center transition-colors"
      >
        <Plus class="size-5" />
      </span>
      <p class="text-foreground text-base font-medium">{m.dashboard_new_org_card_title()}</p>
      <p class="text-muted-foreground max-w-[22rem] text-sm leading-relaxed">
        {m.dashboard_new_org_card_body()}
      </p>
    </a>
  </div>

  <!-- Pending claims surface only when the user has open claim_requests.
       Filed claims need a verification email from the user before anything
       moves; surfacing them here keeps the action discoverable when a user
       loses the original UID page. Card shape matches org cards for one
       grid rhythm; the badge + sub-line carry the "you still owe us an
       email" cue. -->
  {#if data.pendingClaims.length > 0}
    <section class="mt-16">
      <div class="mb-8">
        <h2 class="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl">
          {m.dashboard_claims_heading()}
        </h2>
      </div>
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {#each data.pendingClaims as claim (claim.uid)}
          <a
            href="/dashboard/claims/{claim.uid}"
            class="bg-background border-foreground/15 hover:border-primary group flex flex-col border p-6 transition-colors sm:p-7"
          >
            <div class="mb-4 flex items-center justify-between gap-3">
              <span class="text-muted-foreground truncate font-mono text-sm">{claim.uid}</span>
              <span
                class="text-muted-foreground border-border inline-block shrink-0 border px-2 py-0.5 font-mono text-xs tracking-tight uppercase"
              >
                {m.dashboard_claims_card_badge()}
              </span>
            </div>
            <h3 class="text-foreground text-xl font-medium tracking-tight">
              {claim.displayName ?? claim.slug}
            </h3>
            {#if claim.displayName}
              <span class="text-muted-foreground mt-1 font-mono text-sm">{claim.slug}</span>
            {/if}
            <div
              class="text-muted-foreground mt-auto flex items-center justify-between gap-3 pt-6 text-sm"
            >
              <span>{m.dashboard_claims_card_hint()}</span>
              <ArrowRight
                class="text-muted-foreground/50 group-hover:text-primary size-4 transition-all group-hover:translate-x-0.5"
              />
            </div>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</div>
