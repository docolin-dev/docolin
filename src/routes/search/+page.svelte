<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { m } from "$paraglide/messages";
  import { localizeHref, getLocale } from "$paraglide/runtime";
  import Search from "@lucide/svelte/icons/search";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import X from "@lucide/svelte/icons/x";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as Select from "$lib/components/ui/select";
  import FacetRail from "$lib/components/search/FacetRail.svelte";
  import SearchResultCard from "$lib/components/search/SearchResultCard.svelte";
  import SetupBanner from "$lib/components/search/SetupBanner.svelte";
  import { typeLabel, statusLabel, languageLabel, sortLabel } from "$lib/components/search/labels";
  import {
    parseFilters,
    filtersToQuery,
    activeFilterCount,
    type SearchFilters,
  } from "$lib/components/search/filter-state";
  import type {
    SearchResult,
    SearchFacets,
    SearchSort,
    SearchResponse,
  } from "$lib/components/search/types";
  import { getInferredSetup, getTuned, setTuned, clearSetup } from "$lib/client/setup-profile";

  // The full hybrid search surface (the ⌘K palette and hero are the instant
  // lexical paths). The HTML shell is reader-independent (state lives in the URL,
  // setup stays local), so it stays edge-cacheable; results + facet counts load
  // from /api/search after hydration.

  const PAGE_SIZE = 20;
  const SORT_OPTIONS: SearchSort[] = ["relevance", "verified", "recent", "newest"];

  // All shareable state comes from the URL; this is the single source of truth.
  const filters = $derived(parseFilters(page.url.searchParams));
  const activeCount = $derived(activeFilterCount(filters));
  const isBrowse = $derived(filters.q.length === 0 && activeCount === 0);
  const locale = $derived(getLocale());

  // The box mirrors the URL query but stays editable; typing reassigns it and a
  // debounce pushes it back to the URL (which re-syncs it on back/forward).
  let queryInput = $derived(filters.q);

  let results = $state<SearchResult[]>([]);
  let facets = $state<SearchFacets | null>(null);
  let total = $state(0);
  let loading = $state(false);
  let loadingMore = $state(false);
  let failed = $state(false);
  let resolvedKey = $state<string | null>(null);
  // Tracks the facet signature already aggregated, so a sort-only change reuses
  // the existing counts instead of re-running the aggregation.
  let facetKeyResolved = $state<string | null>(null);

  // Local, client-only reader context (see setup-profile). Read after mount so it
  // reflects real localStorage rather than the SSR pass.
  let mounted = $state(false);
  let setupTags = $state<string[]>([]);
  let tuned = $state(true);
  let sheetOpen = $state(false);

  let controller: AbortController | null = null;

  // Encodes everything that should trigger a fresh page-0 fetch.
  const fetchKey = $derived(JSON.stringify({ f: filters, setup: tuned ? setupTags : [], locale }));
  // Facet counts depend on the matched set, not the ordering; dropping sort lets
  // a sort-only change skip re-aggregation (undefined keys are omitted by JSON).
  const facetKey = $derived(
    JSON.stringify({ ...filters, sort: undefined, setup: tuned ? setupTags : [], locale }),
  );

  function apiParams(from: number, withFacets: boolean): URLSearchParams {
    const p = filtersToQuery(filters);
    p.set("mode", "hybrid");
    p.set("lang", locale);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(from));
    if (withFacets) p.set("facets", "1");
    if (tuned && setupTags.length > 0) p.set("setup", setupTags.join(","));
    return p;
  }

  async function runMain(): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    loading = true;
    failed = false;
    // Re-aggregate facets only when the matched set changed (not on a sort flip).
    const withFacets = facets === null || facetKeyResolved !== facetKey;
    try {
      const res = await fetch(`/api/search?${apiParams(0, withFacets).toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`search failed: ${String(res.status)}`);
      const data = (await res.json()) as SearchResponse;
      results = data.results;
      if (withFacets) {
        facets = data.facets;
        total = data.total;
        facetKeyResolved = facetKey;
      }
      resolvedKey = fetchKey;
    } catch (error) {
      // An abort means a newer request superseded this one; keep what's shown.
      if (error instanceof DOMException && error.name === "AbortError") return;
      failed = true;
    } finally {
      loading = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMore || loading) return;
    loadingMore = true;
    const from = results.length;
    try {
      const res = await fetch(`/api/search?${apiParams(from, false).toString()}`);
      if (!res.ok) throw new Error(`search failed: ${String(res.status)}`);
      const data = (await res.json()) as SearchResponse;
      results = [...results, ...data.results];
    } catch {
      // Leave the current results in place; the reader can retry the button.
    } finally {
      loadingMore = false;
    }
  }

  // Fetch page 0 whenever the query, filters, setup, or locale change.
  $effect(() => {
    void fetchKey;
    if (!mounted) return;
    void runMain();
  });

  // Debounced write of the typed query into the URL (the instant facet toggles
  // write immediately via navigate()).
  let debounce: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const next = queryInput.trim();
    clearTimeout(debounce);
    if (next === filters.q) return;
    debounce = setTimeout(() => {
      navigate({ ...filters, q: next }, false);
    }, 300);
  });

  function navigate(next: SearchFilters, push: boolean): void {
    const query = filtersToQuery(next).toString();
    const target = query.length > 0 ? `/search?${query}` : "/search";
    void goto(localizeHref(target), { replaceState: !push, keepFocus: true, noScroll: true });
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    clearTimeout(debounce);
    navigate({ ...filters, q: queryInput.trim() }, true);
  }

  function changeSort(value: SearchSort): void {
    navigate({ ...filters, sort: value }, false);
  }

  // The Select emits a plain string (and "" when cleared); narrow it back to the
  // union rather than casting, so an unknown value is ignored instead of routed.
  function onSortChange(value: string): void {
    const next = SORT_OPTIONS.find((option) => option === value);
    if (next !== undefined) changeSort(next);
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

  // Active-filter chips: each removes exactly its own filter.
  interface Chip {
    key: string;
    label: string;
    next: SearchFilters;
  }
  const chips = $derived.by<Chip[]>(() => {
    const out: Chip[] = [];
    if (filters.kind !== null) {
      out.push({
        key: `kind:${filters.kind}`,
        label: filters.kind,
        next: { ...filters, kind: null },
      });
    }
    for (const tag of filters.appliesTo) {
      out.push({
        key: `applies:${tag}`,
        label: tag,
        next: { ...filters, appliesTo: filters.appliesTo.filter((v) => v !== tag) },
      });
    }
    for (const value of filters.types) {
      out.push({
        key: `type:${value}`,
        label: typeLabel(value),
        next: { ...filters, types: filters.types.filter((v) => v !== value) },
      });
    }
    for (const value of filters.status) {
      out.push({
        key: `status:${value}`,
        label: statusLabel(value),
        next: { ...filters, status: filters.status.filter((v) => v !== value) },
      });
    }
    if (filters.language !== null) {
      out.push({
        key: `lang:${filters.language}`,
        label: languageLabel(filters.language, locale),
        next: { ...filters, language: null },
      });
    }
    if (filters.verifiedOnly || filters.minPango !== null) {
      out.push({
        key: "verification",
        label:
          filters.minPango !== null
            ? m.search_min_pango_option({ score: filters.minPango })
            : m.search_verified_only(),
        next: { ...filters, verifiedOnly: false, minPango: null },
      });
    }
    return out;
  });

  const showSkeleton = $derived(loading && results.length === 0);
  const showEmpty = $derived(
    !loading && !failed && resolvedKey === fetchKey && results.length === 0,
  );
  const hasMore = $derived(results.length > 0 && results.length < total);
  // The count to display: the facet total reflects the full filtered set.
  const countLabel = $derived(
    total === 1
      ? m.search_results_count_one({ count: 1 })
      : m.search_results_count_other({ count: total }),
  );
</script>

<svelte:head>
  <title>
    {filters.q.length > 0 ? `${filters.q} · ${m.search_meta_title()}` : m.search_meta_title()} · docolin
  </title>
  <meta name="robots" content="noindex" />
</svelte:head>

<DocoViewerNavbar kindSegments={[]} />

<main class="mx-auto w-full max-w-6xl px-6 pt-24 pb-16">
  <form role="search" onsubmit={submit} class="relative mb-6">
    <Search
      class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
    />
    <input
      type="search"
      bind:value={queryInput}
      placeholder={m.search_input_placeholder()}
      autocomplete="off"
      spellcheck="false"
      aria-label={m.search_input_placeholder()}
      class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full appearance-none border pr-3 pl-9 text-base outline-none focus-visible:ring-4"
    />
  </form>

  <div class="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
    <!-- Desktop filter rail -->
    <aside class="hidden lg:block">
      <div class="sticky top-24">
        {#if facets !== null}
          <FacetRail
            {facets}
            {filters}
            {locale}
            onChange={(next: SearchFilters) => {
              navigate(next, false);
            }}
          />
        {/if}
      </div>
    </aside>

    <section aria-label={m.search_results_label()} class="min-w-0">
      <!-- Header: count/browse title, mobile filters button, sort -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <h1 class="text-foreground text-lg font-semibold tracking-tight">
          {#if isBrowse}
            {m.search_browse_title()}
          {:else}
            {countLabel}
          {/if}
        </h1>

        <div class="ml-auto flex items-center gap-2">
          <!-- Mobile: open the filter sheet -->
          <button
            type="button"
            onclick={() => {
              sheetOpen = true;
            }}
            class="border-input text-foreground hover:bg-accent inline-flex h-9 items-center gap-2 border px-3 text-sm transition-colors lg:hidden"
          >
            <SlidersHorizontal class="size-4" />
            {m.search_filters_heading()}
            {#if activeCount > 0}
              <span
                class="bg-primary text-primary-foreground inline-flex min-w-5 justify-center px-1 text-xs"
                >{activeCount}</span
              >
            {/if}
          </button>

          <!-- A native <select> hands its dropdown to the OS, which ignores the
               theme entirely (and on a phone renders it outside the page). Use
               the portaled, themed Select, as the language switcher does. -->
          <div class="flex items-center gap-2 text-sm">
            <span class="text-muted-foreground hidden sm:inline">{m.search_sort_label()}</span>
            <Select.Root type="single" value={filters.sort} onValueChange={onSortChange}>
              <Select.Trigger class="h-9! w-auto" aria-label={m.search_sort_label()}>
                {sortLabel(filters.sort)}
              </Select.Trigger>
              <Select.Content align="end" preventScroll={false}>
                {#each SORT_OPTIONS as option (option)}
                  <Select.Item value={option} label={sortLabel(option)}>
                    {sortLabel(option)}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      </div>

      <!-- Active filter chips -->
      {#if chips.length > 0}
        <div aria-label={m.search_active_filters_label()} class="mb-4 flex flex-wrap gap-2">
          {#each chips as chip (chip.key)}
            <button
              type="button"
              onclick={() => {
                navigate(chip.next, false);
              }}
              aria-label={m.search_filter_remove({ label: chip.label })}
              class="border-foreground/15 text-foreground hover:border-primary/40 hover:text-primary inline-flex items-center gap-1 border px-2 py-1 text-xs transition-colors"
            >
              <span class="max-w-[16rem] truncate">{chip.label}</span>
              <X class="size-3" />
            </button>
          {/each}
        </div>
      {/if}

      <!-- Setup banner: only when there's an inferred setup to tune to -->
      {#if setupTags.length > 0}
        <div class="mb-4">
          <SetupBanner tags={setupTags} {tuned} onToggle={toggleTuned} onReset={resetSetup} />
        </div>
      {/if}

      {#if failed}
        <div
          class="border-foreground/10 bg-muted/20 flex flex-col items-center border px-6 py-16 text-center"
        >
          <h2 class="text-foreground text-lg font-medium tracking-tight">
            {m.search_error_title()}
          </h2>
          <p class="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
            {m.search_error_body()}
          </p>
          <button
            type="button"
            onclick={() => {
              void runMain();
            }}
            class="border-input text-foreground hover:bg-accent mt-4 inline-flex h-9 items-center border px-3 text-sm transition-colors"
          >
            {m.search_retry()}
          </button>
        </div>
      {:else if showSkeleton}
        <div class="flex flex-col gap-4">
          {#each [0, 1, 2, 3, 4] as i (i)}
            <div class="border-foreground/10 bg-background border p-5 sm:p-6">
              <div class="bg-muted h-3 w-32 animate-pulse"></div>
              <div class="bg-muted mt-3 h-5 w-2/3 animate-pulse"></div>
              <div class="bg-muted/70 mt-3 h-3 w-full animate-pulse"></div>
              <div class="bg-muted/70 mt-2 h-3 w-4/5 animate-pulse"></div>
            </div>
          {/each}
        </div>
      {:else if showEmpty}
        <div
          class="border-foreground/10 bg-muted/20 flex flex-col items-center border px-6 py-16 text-center"
        >
          <h2 class="text-foreground text-lg font-medium tracking-tight">
            {m.search_empty_title()}
          </h2>
          <p class="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
            {m.search_empty_body()}
          </p>
          {#if activeCount > 0}
            <button
              type="button"
              onclick={() => {
                navigate(
                  {
                    ...filters,
                    kind: null,
                    appliesTo: [],
                    types: [],
                    status: [],
                    language: null,
                    verifiedOnly: false,
                    minPango: null,
                  },
                  false,
                );
              }}
              class="border-input text-foreground hover:bg-accent mt-4 inline-flex h-9 items-center border px-3 text-sm transition-colors"
            >
              {m.search_filters_clear()}
            </button>
          {/if}
        </div>
      {:else}
        {#if isBrowse}
          <p class="text-muted-foreground mb-4 max-w-prose text-sm leading-relaxed">
            {m.search_browse_body()}
          </p>
        {/if}
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

<!-- Mobile filter sheet -->
<Sheet.Root bind:open={sheetOpen}>
  <Sheet.Content side="bottom" class="max-h-[85dvh] overflow-y-auto rounded-none px-4 pt-4 pb-8">
    <Sheet.Header class="px-0">
      <Sheet.Title>{m.search_filters_heading()}</Sheet.Title>
    </Sheet.Header>
    {#if facets !== null}
      <FacetRail
        {facets}
        {filters}
        {locale}
        onChange={(next: SearchFilters) => {
          navigate(next, false);
        }}
      />
    {/if}
  </Sheet.Content>
</Sheet.Root>
