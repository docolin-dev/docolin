<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref, getLocale } from "$paraglide/runtime";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import SearchResultCard from "$lib/components/search/SearchResultCard.svelte";
  import SetupBanner from "$lib/components/search/SetupBanner.svelte";
  import { buildKindTree, findKindNode, labelForSegment } from "$lib/components/search/kind-tree";
  import type { SearchResult, SearchResponse } from "$lib/components/search/types";
  import { getInferredSetup, getTuned, setTuned, clearSetup } from "$lib/client/setup-profile";
  import type { PageProps } from "./$types";

  // A kind path renders all docos under it, default-ranked from SSR (indexable),
  // then re-ranked by the reader's local setup after hydration. The left folder
  // nav links one level deeper into the taxonomy. This is the soft-link target.

  let { data }: PageProps = $props();

  const PAGE_SIZE = 20;

  const segments = $derived(data.segments);
  const heading = $derived(labelForSegment(segments[segments.length - 1]));
  const locale = $derived(getLocale());

  // ltree (dotted/underscored) -> display path (slashed/hyphenated). Inlined to
  // keep the server schema helpers out of the client bundle.
  function ltreeToDisplay(path: string): string {
    return path.replaceAll(".", "/").replaceAll("_", "-");
  }

  // Folder navigator: the immediate children of the current kind, with rolled-up
  // counts. Navigating to one descends the taxonomy (each page shows its level).
  const children = $derived.by(() => {
    if (data.facets === null) return [];
    const node = findKindNode(buildKindTree(data.facets.kind), data.kindLtree);
    return node?.children ?? [];
  });

  // Client overrides layered over the SSR default (null = use SSR). Keeping the
  // SSR results in `data` and reading them through a $derived means the server-
  // rendered list shows immediately (indexable) without copying it into $state.
  let clientResults = $state<SearchResult[] | null>(null);
  let clientTotal = $state<number | null>(null);
  const results = $derived(clientResults ?? data.results);
  const total = $derived(clientTotal ?? data.total);
  let loadingMore = $state(false);

  let mounted = $state(false);
  let setupTags = $state<string[]>([]);
  let tuned = $state(true);
  let controller: AbortController | null = null;

  // Builds the /api/search query string. Plain string assembly (not
  // URLSearchParams, which the svelte reactivity lint flags in components) since
  // it's transient, recreated per request.
  function buildQuery(offset: number): string {
    const parts = [
      `kind=${encodeURIComponent(data.kindDisplay)}`,
      `limit=${String(PAGE_SIZE)}`,
      `offset=${String(offset)}`,
      "mode=hybrid",
      `lang=${encodeURIComponent(locale)}`,
    ];
    if (tuned && setupTags.length > 0) {
      parts.push(`setup=${encodeURIComponent(setupTags.join(","))}`);
    }
    return parts.join("&");
  }

  // Re-rank by the reader's local setup once mounted. Reset to the SSR default
  // first (clears any prior override on navigation / toggle-off), then, if there
  // is a setup, fetch the personalized order and override.
  $effect(() => {
    void data.kindDisplay;
    const setup = tuned ? setupTags : [];
    if (!mounted) return;
    clientResults = null;
    clientTotal = null;
    if (setup.length === 0) return;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    void (async () => {
      try {
        const res = await fetch(`/api/search?${buildQuery(0)}`, { signal });
        if (!res.ok) return;
        const ranked = (await res.json()) as SearchResponse;
        clientResults = ranked.results;
        clientTotal = ranked.total;
      } catch {
        // Aborted by a newer request or offline: keep the SSR results in place.
      }
    })();
  });

  async function loadMore(): Promise<void> {
    if (loadingMore) return;
    loadingMore = true;
    try {
      const res = await fetch(`/api/search?${buildQuery(results.length)}`);
      if (!res.ok) return;
      const more = (await res.json()) as SearchResponse;
      clientResults = [...results, ...more.results];
      clientTotal = total;
    } catch {
      // Leave current results; the reader can retry the button.
    } finally {
      loadingMore = false;
    }
  }

  function toggleTuned(): void {
    tuned = !tuned;
    setTuned(tuned);
  }

  function resetSetup(): void {
    clearSetup();
    setupTags = [];
  }

  onMount(() => {
    setupTags = getInferredSetup();
    tuned = getTuned();
    mounted = true;
  });

  const hasMore = $derived(results.length > 0 && results.length < total);
  const metaDescription = $derived(
    data.registryDescription ?? m.kind_meta_description({ kind: data.kindDisplay }),
  );

  // SSR-rendered structured data so crawlers see the listing (these pages are
  // indexable, unlike /search). Built from the default-ranked SSR results.
  const jsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: heading,
    description: metaDescription,
    url: page.url.href,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: data.results.map((result, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: new URL(result.href, page.url.origin).href,
        name: result.title,
      })),
    },
  });
  /* eslint-disable no-useless-escape */
  const jsonLdHtml = $derived(
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>`,
  );
  /* eslint-enable no-useless-escape */
</script>

<svelte:head>
  <title>{heading} · docolin</title>
  <meta name="description" content={metaDescription} />
  <meta property="og:title" content={`${heading} · docolin`} />
  <meta property="og:description" content={metaDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={page.url.href} />
  <meta property="og:locale" content={locale} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html jsonLdHtml}
</svelte:head>

<DocoViewerNavbar kindSegments={segments} />

<main class="mx-auto w-full max-w-6xl px-6 pt-24 pb-16">
  <header class="mb-8">
    <h1 class="text-foreground text-3xl font-semibold tracking-tight">{heading}</h1>
    {#if data.registryDescription}
      <p class="text-muted-foreground mt-2 max-w-prose text-base leading-relaxed">
        {data.registryDescription}
      </p>
    {/if}
  </header>

  <div class="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
    <!-- Folder navigator: always present (so the results column keeps a constant
         width), showing the subtopics to descend into, or a leaf marker. -->
    <aside class="mb-8 lg:mb-0">
      <div class="lg:sticky lg:top-24">
        <h2
          class="text-foreground border-foreground/10 border-b pb-3 text-sm font-semibold tracking-tight"
        >
          {m.kind_subtopics_heading()}
        </h2>
        {#if children.length > 0}
          <nav class="mt-2 flex flex-col">
            {#each children as child (child.path)}
              <a
                href={localizeHref(`/${ltreeToDisplay(child.path)}`)}
                class="text-foreground hover:text-primary group flex items-center gap-2 py-1.5 text-sm transition-colors"
              >
                <ChevronRight class="text-muted-foreground size-3.5 shrink-0" />
                <span class="truncate">{child.label}</span>
                <span class="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                  {child.count}
                </span>
              </a>
            {/each}
          </nav>
        {:else}
          <p class="text-muted-foreground mt-3 text-sm">{m.kind_no_subtopics()}</p>
        {/if}
      </div>
    </aside>

    <section aria-label={heading} class="min-w-0">
      {#if setupTags.length > 0}
        <div class="mb-4">
          <SetupBanner tags={setupTags} {tuned} onToggle={toggleTuned} onReset={resetSetup} />
        </div>
      {/if}

      {#if results.length === 0}
        <div
          class="border-foreground/10 bg-muted/20 flex flex-col items-center border px-6 py-16 text-center"
        >
          <h2 class="text-foreground text-lg font-medium tracking-tight">{m.kind_empty_title()}</h2>
          <p class="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
            {m.kind_empty_body({ kind: heading })}
          </p>
        </div>
      {:else}
        <p class="text-muted-foreground mb-4 text-sm">
          {total === 1
            ? m.search_results_count_one({ count: 1 })
            : m.search_results_count_other({ count: total })}
        </p>
        <div class="flex flex-col gap-4">
          {#each results as result (result.href)}
            <SearchResultCard {result} setupTags={tuned ? setupTags : []} {locale} />
          {/each}
        </div>

        {#if hasMore}
          <div class="mt-6 flex justify-center">
            <button
              type="button"
              onclick={() => {
                void loadMore();
              }}
              disabled={loadingMore}
              class="border-input text-foreground hover:bg-accent inline-flex h-10 items-center gap-2 border px-4 text-sm transition-colors disabled:opacity-50"
            >
              {#if loadingMore}
                <LoaderCircle class="size-4 animate-spin" />
              {/if}
              {m.search_load_more()}
            </button>
          </div>
        {/if}
      {/if}
    </section>
  </div>
</main>
