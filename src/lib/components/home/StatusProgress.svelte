<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { SITE_REPO } from "$lib/site";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Github from "$lib/components/icons/Github.svelte";

  // After the whole page, give the visitor a way to USE docolin (browse the
  // commons) as the primary action, with the GitHub star as the secondary nod.
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
      <Button href={localizeHref("/browse")} size="lg" class="group h-11 gap-2 px-5 text-base">
        {m.home_status_cta_browse()}
        <ArrowRight class="size-4 transition-transform group-hover:translate-x-1" />
      </Button>
      <Button
        href={SITE_REPO}
        target="_blank"
        rel="noopener noreferrer"
        variant="outline"
        size="lg"
        class="h-11 gap-2 px-5 text-base"
      >
        <Github class="size-4" />
        {m.home_status_cta_github()}
      </Button>
    </div>
  </div>
</section>
