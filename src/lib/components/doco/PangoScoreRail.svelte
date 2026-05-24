<script lang="ts">
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import { relativeTime } from "$lib/relative-time";
  import PawPrint from "@lucide/svelte/icons/paw-print";

  // Sticky right-rail Pango Score: the persistent trust signal while reading,
  // plus a shortcut to the stamp prompt. Desktop only (the rail is hidden below
  // xl); the end-of-article prompt carries the score on smaller screens. The
  // scroll is handled by the parent (onStampIt) so it can pin the TOC scroll-spy
  // during the programmatic scroll, the same way "back to top" does.
  let {
    score,
    verifiedCount,
    lastConfirmedAt,
    onStampIt,
  }: {
    score: number | null;
    verifiedCount: number;
    lastConfirmedAt: string | null;
    onStampIt: () => void;
  } = $props();
</script>

<div class="border-foreground/10 mb-6 border-b pb-6">
  <p
    class="text-muted-foreground mb-2 flex items-center gap-1.5 font-mono text-xs tracking-[0.18em] uppercase"
  >
    <PawPrint class="size-3.5" />
    {m.doco_pango_score_label()}
  </p>

  {#if score !== null}
    <p class="text-foreground text-3xl font-semibold tracking-tight tabular-nums">{score}</p>
    <p class="text-muted-foreground mt-1 text-xs">
      {m.doco_pango_score_verifications({ count: verifiedCount })}
    </p>
    {#if lastConfirmedAt !== null}
      <p class="text-muted-foreground/70 text-xs">
        {m.doco_pango_score_last_confirmed({ when: relativeTime(lastConfirmedAt, getLocale()) })}
      </p>
    {/if}
    <button
      type="button"
      onclick={onStampIt}
      class="border-foreground/15 hover:border-foreground/40 text-foreground mt-3 inline-flex w-full cursor-pointer items-center justify-center border px-3 py-1.5 text-xs font-medium transition-colors"
    >
      {m.doco_pango_score_stamp_it()}
    </button>
  {:else}
    <p class="text-muted-foreground text-sm font-medium">{m.doco_pango_score_unrated()}</p>
    <button
      type="button"
      onclick={onStampIt}
      class="text-primary hover:text-primary/80 mt-2 inline-flex cursor-pointer items-start gap-1 text-left text-xs font-medium transition-colors"
    >
      {m.doco_pango_score_be_first()}
      <span aria-hidden="true">↓</span>
    </button>
  {/if}
</div>
