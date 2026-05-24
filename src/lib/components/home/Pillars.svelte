<script lang="ts">
  import { m } from "$paraglide/messages";
  import Check from "@lucide/svelte/icons/check";
  import Bot from "@lucide/svelte/icons/bot";

  // Each pillar gets its own evidence artifact instead of an abstract icon.
  // The artifact is the dominant visual; the title and body caption it.
  // Verification leads the row: it's the one thing no other docs platform has,
  // so it gets the first card and a real signed stamp rather than a counter.
</script>

<section class="px-6 py-24 sm:py-32">
  <div class="mx-auto max-w-6xl">
    <div class="mb-14 max-w-2xl">
      <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
        {m.home_what_eyebrow()}
      </p>
      <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {m.home_what_title()}
      </h2>
    </div>

    <div class="bg-border/60 grid grid-cols-1 gap-px md:grid-cols-3">
      <article class="bg-background flex flex-col p-6 sm:p-8">
        <div
          class="border-foreground/10 bg-muted/30 mb-6 flex h-44 flex-col justify-center border p-5"
        >
          <div class="flex items-center justify-between">
            <span
              class="bg-primary/15 text-primary inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-medium"
            >
              <Check class="size-3" />
              {m.home_what_verified_outcome()}
            </span>
            <span class="text-foreground/45 font-mono text-[10px]">
              {m.home_what_verified_when()}
            </span>
          </div>
          <p class="text-foreground/85 mt-4 text-xs">
            {m.home_what_verified_by()}
            <span class="text-primary">@maria</span>
          </p>
          <p class="text-foreground/55 mt-1 font-mono text-[10px]">
            Ubuntu 24.04 · kernel 6.8 · NVIDIA 550
          </p>
          <p
            class="border-foreground/10 text-foreground/55 mt-3 flex items-center gap-1.5 border-t pt-2.5 text-[10px]"
          >
            <Bot class="text-foreground/40 size-3 shrink-0" />
            {m.home_what_verified_agent()}
          </p>
        </div>
        <h3 class="text-xl font-medium tracking-tight">{m.home_what_verified_title()}</h3>
        <p class="text-muted-foreground mt-3 leading-relaxed">{m.home_what_verified_body()}</p>
      </article>

      <article class="bg-background flex flex-col p-6 sm:p-8">
        <div
          class="border-foreground/10 bg-muted/30 mb-6 flex h-44 flex-col justify-center border p-5"
        >
          <div class="font-mono text-xs leading-relaxed">
            <div class="text-foreground/25">hardware /</div>
            <div class="text-foreground/40 pl-3">gpu /</div>
            <div class="text-foreground/65 pl-6">nvidia /</div>
            <div class="text-foreground pl-9 font-medium">driver-install</div>
          </div>
          <div class="mt-3">
            <span
              class="border-foreground/15 inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px]"
            >
              <span class="text-foreground/60">applies_to:</span>
              <span class="text-primary">ubuntu-24.04</span>
              <span class="text-foreground/40">·</span>
              <span class="text-primary">nvidia</span>
            </span>
          </div>
        </div>
        <h3 class="text-xl font-medium tracking-tight">{m.home_what_structured_title()}</h3>
        <p class="text-muted-foreground mt-3 leading-relaxed">{m.home_what_structured_body()}</p>
      </article>

      <article class="bg-background flex flex-col p-6 sm:p-8">
        <div
          class="border-foreground/10 bg-muted/30 mb-6 flex h-44 flex-col justify-between border p-5"
        >
          <div>
            <p class="text-foreground/55 text-[11px] leading-snug">
              <span class="text-foreground/35">›</span>
              {m.home_what_attributed_question()}
            </p>
            <p class="text-foreground/85 mt-2 line-clamp-3 text-xs leading-relaxed">
              {m.home_what_attributed_answer()}
            </p>
          </div>
          <p class="border-foreground/10 mt-3 border-t pt-2 font-mono text-[10px]">
            <span class="text-foreground/55">{m.home_what_attributed_citation()}</span>
            <span class="text-primary">@jhalter</span>
          </p>
        </div>
        <h3 class="text-xl font-medium tracking-tight">{m.home_what_attributed_title()}</h3>
        <p class="text-muted-foreground mt-3 leading-relaxed">{m.home_what_attributed_body()}</p>
      </article>
    </div>
  </div>
</section>
