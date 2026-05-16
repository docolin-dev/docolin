<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { SITE_REPO } from "$lib/site";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Heart from "@lucide/svelte/icons/heart";
  import Github from "$lib/components/icons/Github.svelte";

  // Star button above already links to the repo; the explicit "Follow the
  // build" line would just duplicate that CTA.
</script>

<section class="relative overflow-hidden px-6 py-24 sm:py-32">
  <div
    aria-hidden="true"
    class="bg-primary pointer-events-none absolute bottom-0 left-1/2 -z-10 h-[300px] w-[600px] -translate-x-1/2 translate-y-1/3 opacity-10 blur-[120px]"
  ></div>

  <div class="mx-auto max-w-2xl text-center">
    <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
      {m.home_status_eyebrow()}
    </p>
    <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
      {m.home_status_title()}
    </h2>
    <p class="text-muted-foreground mx-auto mt-5 leading-relaxed">{m.home_status_body()}</p>

    <div class="mt-10 flex flex-wrap items-center justify-center gap-3">
      <Button
        href={SITE_REPO}
        target="_blank"
        rel="noopener noreferrer"
        size="lg"
        class="group h-12 gap-2 px-5 text-base"
      >
        <Github class="size-4" />
        {m.home_status_cta_github()}
        <ArrowRight class="size-4 transition-transform group-hover:translate-x-1" />
      </Button>
      <Button
        href={localizeHref("/sponsor")}
        variant="outline"
        size="lg"
        class="group/sponsor h-12 gap-2 px-5 text-base"
      >
        <Heart
          class="group-hover/sponsor:fill-primary group-hover/sponsor:text-primary size-4 transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/sponsor:scale-125"
        />
        {m.home_status_cta_sponsor()}
      </Button>
    </div>
  </div>
</section>
