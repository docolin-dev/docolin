<script lang="ts">
  import { m } from "$paraglide/messages";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";

  // Same docolin path resolves to different guides based on the reader's
  // setup. Shown literally so the promise is hard to misread.
</script>

<section class="px-6 py-24 sm:py-32">
  <div class="mx-auto max-w-6xl">
    <div class="mx-auto mb-14 max-w-2xl text-center">
      <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
        {m.home_search_eyebrow()}
      </p>
      <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {m.home_search_title()}
      </h2>
      <p class="text-muted-foreground mx-auto mt-5 max-w-xl leading-relaxed">
        {m.home_search_body()}
      </p>
    </div>

    <div class="mx-auto mb-10 flex max-w-md flex-col items-center gap-2 text-center">
      <span class="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
        {m.home_search_query_label()}
      </span>
      <div
        class="border-foreground/15 bg-background flex items-center gap-3 border px-4 py-2.5 font-mono text-sm"
      >
        <span class="text-foreground/40">›</span>
        <span class="text-foreground">{m.home_search_query()}</span>
      </div>
    </div>

    <div class="relative grid gap-px md:grid-cols-[1fr_auto_1fr]">
      <article class="bg-background border-foreground/10 border p-5 sm:p-6">
        <div class="text-foreground/55 mb-4 flex items-center gap-2 font-mono text-[11px]">
          <span class="bg-primary size-1.5"></span>
          <span>{m.home_search_left_system()}</span>
        </div>
        <p class="text-muted-foreground/80 mb-1 font-mono text-[11px] tracking-tight">
          {m.home_search_left_kind()}
        </p>
        <h3 class="text-base font-medium tracking-tight">{m.home_search_left_title()}</h3>
        <div class="mt-4 flex items-center justify-between gap-3">
          <p class="text-muted-foreground flex items-center gap-1.5 text-xs">
            <PawPrint class="text-primary size-3.5" />
            {m.home_search_left_verified()}
          </p>
          <span
            class="bg-primary/10 text-primary border-primary/20 inline-flex items-center border px-2 py-0.5 font-mono text-[10px] tracking-tight"
          >
            {m.home_search_for_your_system()}
          </span>
        </div>
        <p class="text-foreground/45 mt-2.5 font-mono text-[10px]">
          {m.home_search_left_receipts()}
        </p>
      </article>

      <div
        class="text-muted-foreground/50 hidden items-center justify-center px-4 md:flex"
        aria-hidden="true"
      >
        <ArrowRight class="size-5" />
      </div>

      <article class="bg-background border-foreground/10 border p-5 sm:p-6">
        <div class="text-foreground/55 mb-4 flex items-center gap-2 font-mono text-[11px]">
          <span class="bg-primary size-1.5"></span>
          <span>{m.home_search_right_system()}</span>
        </div>
        <p class="text-muted-foreground/80 mb-1 font-mono text-[11px] tracking-tight">
          {m.home_search_right_kind()}
        </p>
        <h3 class="text-base font-medium tracking-tight">{m.home_search_right_title()}</h3>
        <div class="mt-4 flex items-center justify-between gap-3">
          <p class="text-muted-foreground flex items-center gap-1.5 text-xs">
            <PawPrint class="text-primary size-3.5" />
            {m.home_search_right_verified()}
          </p>
          <span
            class="bg-primary/10 text-primary border-primary/20 inline-flex items-center border px-2 py-0.5 font-mono text-[10px] tracking-tight"
          >
            {m.home_search_for_your_system()}
          </span>
        </div>
        <p class="text-foreground/45 mt-2.5 font-mono text-[10px]">
          {m.home_search_right_receipts()}
        </p>
      </article>
    </div>
  </div>
</section>
