<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { relativeTime } from "$lib/relative-time";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import type { SearchResult } from "./types";
  import { typeLabel } from "./labels";

  interface Props {
    result: SearchResult;
    /** The reader's inferred setup tags, so matching applies_to chips stand out. */
    setupTags: string[];
    locale: string;
  }

  let { result, setupTags, locale }: Props = $props();

  const setupSet = $derived(new Set(setupTags));
  // Show the chips that match the reader's setup first.
  const chips = $derived(
    [...result.appliesTo].sort((a, b) => {
      const am = setupSet.has(a) ? 0 : 1;
      const bm = setupSet.has(b) ? 0 : 1;
      return am - bm;
    }),
  );
</script>

<article
  class="group border-foreground/10 bg-background hover:border-foreground/30 hover:bg-foreground/5 focus-within:border-foreground/30 focus-within:bg-foreground/5 relative border p-5 transition-colors sm:p-6"
>
  <div class="text-muted-foreground mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
    <span class="font-mono text-xs">{result.kindPath}</span>
    <span aria-hidden="true" class="text-foreground/20">·</span>
    <span class="text-xs tracking-wide uppercase">{typeLabel(result.type)}</span>
  </div>

  <h2 class="text-lg leading-snug font-medium tracking-tight">
    <!-- Stretched link: the ::after covers the whole card so it's all clickable,
         while the title stays the single semantic link (one accessible name).
         Interactive bits below (alternates) sit above it via relative z-10. -->
    <a
      href={localizeHref(result.href)}
      class="text-foreground group-hover:text-primary group-focus-within:text-primary transition-colors after:absolute after:inset-0 after:content-['']"
    >
      {result.title}
    </a>
  </h2>

  {#if result.snippet}
    <p
      class="text-muted-foreground [&_mark]:bg-primary/15 [&_mark]:text-foreground mt-2 text-sm leading-relaxed [&_mark]:px-0.5"
    >
      <!-- Snippet is sanitized server-side with DOMPurify (only <mark> survives). -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html result.snippet}
    </p>
  {:else if result.description}
    <p class="text-muted-foreground mt-2 text-sm leading-relaxed">{result.description}</p>
  {/if}

  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
    {#if result.pangoScore !== null}
      <span
        class="text-primary inline-flex items-center gap-1 font-mono"
        title={m.search_result_pango({ score: String(result.pangoScore) })}
      >
        <PawPrint class="size-3.5" />
        {result.pangoScore}
      </span>
    {:else}
      <span class="text-muted-foreground">{m.search_not_verified()}</span>
    {/if}

    {#if result.lastConfirmedAt}
      <span class="text-muted-foreground">
        {m.search_confirmed({ time: relativeTime(result.lastConfirmedAt, locale) })}
      </span>
    {/if}

    {#each chips.slice(0, 5) as tag (tag)}
      <span
        class="border px-1.5 py-0.5 font-mono {setupSet.has(tag)
          ? 'border-primary/40 text-primary bg-primary/5'
          : 'border-foreground/10 text-muted-foreground'}"
      >
        {tag}
      </span>
    {/each}
  </div>

  {#if result.alternates.length > 0}
    <div
      class="text-muted-foreground relative z-10 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
    >
      <span>{m.search_alternates_label()}</span>
      {#each result.alternates as alt (alt.href)}
        <a
          href={localizeHref(alt.href)}
          class="hover:text-primary inline-flex items-center gap-1 font-mono underline-offset-2 hover:underline"
        >
          {alt.label}{#if alt.pangoScore !== null}<span class="text-primary/70"
              >&middot; {alt.pangoScore}</span
            >{/if}
        </a>
      {/each}
    </div>
  {/if}
</article>
