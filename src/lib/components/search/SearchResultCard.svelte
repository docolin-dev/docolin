<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { relativeTime } from "$lib/relative-time";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import History from "@lucide/svelte/icons/history";
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
  // Setup-matching tags first, capped, so the most relevant chips show.
  function orderTags(tags: string[]): string[] {
    return [...tags]
      .sort((a, b) => (setupSet.has(a) ? 0 : 1) - (setupSet.has(b) ? 0 : 1))
      .slice(0, 4);
  }
  const chips = $derived(orderTags(result.appliesTo));
</script>

<div>
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
           while the title stays the single semantic link. The alternate rows live
           outside this <article>, so they stay independently clickable. -->
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

      {#each chips as tag (tag)}
        <span
          class="border px-1.5 py-0.5 font-mono {setupSet.has(tag)
            ? 'border-primary/40 text-primary bg-primary/5'
            : 'border-foreground/10 text-muted-foreground'}"
        >
          {tag}
        </span>
      {/each}
    </div>
  </article>

  <!-- Older verified versions, as rows attached under the card. Each links to its
       pinned version; highest Pango first (server-ordered, capped). -->
  {#if result.alternates.length > 0}
    <div class="border-foreground/10 divide-foreground/10 bg-muted/20 divide-y border border-t-0">
      {#each result.alternates as alt (alt.href)}
        <a
          href={localizeHref(alt.href)}
          class="group/alt hover:bg-foreground/5 flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-xs transition-colors sm:px-6"
        >
          <History class="text-muted-foreground size-3.5 shrink-0" />
          <span class="text-foreground group-hover/alt:text-primary font-mono transition-colors">
            {alt.label}
          </span>
          {#if alt.pangoScore !== null}
            <span class="text-primary inline-flex items-center gap-1 font-mono">
              <PawPrint class="size-3.5" />
              {alt.pangoScore}
            </span>
          {/if}
          {#if alt.publishedAt}
            <span class="text-muted-foreground">
              {m.search_published({ time: relativeTime(alt.publishedAt, locale) })}
            </span>
          {/if}
          {#if alt.appliesTo.length > 0}
            <span class="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              {#each orderTags(alt.appliesTo) as tag (tag)}
                <span
                  class="border px-1.5 py-0.5 font-mono {setupSet.has(tag)
                    ? 'border-primary/40 text-primary bg-primary/5'
                    : 'border-foreground/10 text-muted-foreground'}"
                >
                  {tag}
                </span>
              {/each}
            </span>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
