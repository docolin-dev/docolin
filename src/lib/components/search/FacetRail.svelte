<script lang="ts">
  import { m } from "$paraglide/messages";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import FacetSection from "./FacetSection.svelte";
  import FacetCheckList from "./FacetCheckList.svelte";
  import KindFacetTree from "./KindFacetTree.svelte";
  import { buildKindTree } from "./kind-tree";
  import { typeLabel, statusLabel, languageLabel } from "./labels";
  import { activeFilterCount, toggleInList, type SearchFilters } from "./filter-state";
  import type { FacetItem, SearchFacets } from "./types";

  interface Props {
    facets: SearchFacets;
    filters: SearchFilters;
    locale: string;
    onChange: (next: SearchFilters) => void;
  }

  let { facets, filters, locale, onChange }: Props = $props();

  // Pango scores run 0-1000; the minimum-score control is a stepped slider.
  const PANGO_MAX = 1000;
  const PANGO_STEP = 50;
  // Live readout while dragging (null = show the committed filter value).
  let pangoDraft = $state<number | null>(null);
  const pangoValue = $derived(pangoDraft ?? filters.minPango ?? 0);

  // ltree (dotted/underscored) <-> display path (slashed/hyphenated). Inlined to
  // avoid importing the server-side schema helpers into the client bundle.
  function ltreeToDisplay(path: string): string {
    return path.replaceAll(".", "/").replaceAll("_", "-");
  }
  function displayToLtree(path: string): string {
    return path.replaceAll("-", "_").replaceAll("/", ".");
  }

  const kindTree = $derived(buildKindTree(facets.kind));
  const selectedKindLtree = $derived(filters.kind === null ? null : displayToLtree(filters.kind));
  const activeCount = $derived(activeFilterCount(filters));

  const appliesItems = $derived<FacetItem[]>(
    facets.appliesTo.map((f) => ({ value: f.value, label: f.value, count: f.count })),
  );
  const typeItems = $derived<FacetItem[]>(
    facets.type.map((f) => ({ value: f.value, label: typeLabel(f.value), count: f.count })),
  );
  const statusItems = $derived<FacetItem[]>(
    facets.status.map((f) => ({ value: f.value, label: statusLabel(f.value), count: f.count })),
  );
  const languageItems = $derived<FacetItem[]>(
    facets.language.map((f) => ({
      value: f.value,
      label: languageLabel(f.value, locale),
      count: f.count,
    })),
  );

  function selectKind(ltreePath: string): void {
    const display = ltreeToDisplay(ltreePath);
    // Clicking the active subtree again clears the kind filter.
    onChange({ ...filters, kind: filters.kind === display ? null : display });
  }

  function setVerified(on: boolean): void {
    // Turning verified off also drops any minimum score (it implies verified).
    onChange({ ...filters, verifiedOnly: on, minPango: on ? filters.minPango : null });
  }

  function setMinPango(value: number | null): void {
    // A minimum score implies "verified only".
    onChange({
      ...filters,
      minPango: value,
      verifiedOnly: value !== null ? true : filters.verifiedOnly,
    });
  }
</script>

<div class="flex flex-col">
  <div class="border-foreground/10 flex items-center justify-between border-b pb-3">
    <h2 class="text-foreground text-sm font-semibold tracking-tight">
      {m.search_filters_heading()}
    </h2>
    {#if activeCount > 0}
      <button
        type="button"
        onclick={() => {
          onChange({
            ...filters,
            kind: null,
            appliesTo: [],
            types: [],
            status: [],
            language: null,
            verifiedOnly: false,
            minPango: null,
          });
        }}
        class="text-muted-foreground hover:text-primary text-xs underline-offset-2 transition-colors hover:underline"
      >
        {m.search_filters_clear()}
      </button>
    {/if}
  </div>

  {#if appliesItems.length > 0}
    <FacetSection title={m.search_facet_setup()}>
      <FacetCheckList
        group="applies_to"
        items={appliesItems}
        selected={filters.appliesTo}
        collapseAfter={8}
        onToggle={(value: string) => {
          onChange({ ...filters, appliesTo: toggleInList(filters.appliesTo, value) });
        }}
      />
    </FacetSection>
  {/if}

  {#if kindTree.length > 0}
    <FacetSection title={m.search_facet_topic()}>
      <KindFacetTree nodes={kindTree} selected={selectedKindLtree} onSelect={selectKind} />
    </FacetSection>
  {/if}

  {#if typeItems.length > 0}
    <FacetSection title={m.search_facet_type()}>
      <FacetCheckList
        group="type"
        items={typeItems}
        selected={filters.types}
        onToggle={(value: string) => {
          onChange({ ...filters, types: toggleInList(filters.types, value) });
        }}
      />
    </FacetSection>
  {/if}

  <FacetSection title={m.search_facet_verification()}>
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <Checkbox
          id="facet-verified-only"
          checked={filters.verifiedOnly}
          onCheckedChange={(checked) => {
            setVerified(checked === true);
          }}
        />
        <label for="facet-verified-only" class="text-foreground cursor-pointer text-sm">
          {m.search_verified_only()}
        </label>
      </div>
      <!-- A minimum score only applies once "verified only" is on (it implies
           verified), so the slider stays hidden until then. -->
      {#if filters.verifiedOnly}
        <div class="flex flex-col gap-1.5 pl-6">
          <div class="text-muted-foreground flex items-center justify-between text-xs">
            <span>{m.search_min_pango_label()}</span>
            <span class="font-mono tabular-nums">
              {pangoValue === 0 ? m.search_min_pango_any() : String(pangoValue)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max={PANGO_MAX}
            step={PANGO_STEP}
            value={pangoValue}
            aria-label={m.search_min_pango_label()}
            oninput={(event) => {
              pangoDraft = Number.parseInt(event.currentTarget.value, 10);
            }}
            onchange={(event) => {
              const next = Number.parseInt(event.currentTarget.value, 10);
              pangoDraft = null;
              setMinPango(next === 0 ? null : next);
            }}
            class="accent-muted-foreground h-1 w-full cursor-pointer"
          />
        </div>
      {/if}
    </div>
  </FacetSection>

  {#if statusItems.length > 0}
    <FacetSection title={m.search_facet_status()}>
      <FacetCheckList
        group="status"
        items={statusItems}
        selected={filters.status}
        onToggle={(value: string) => {
          onChange({ ...filters, status: toggleInList(filters.status, value) });
        }}
      />
    </FacetSection>
  {/if}

  {#if languageItems.length > 1}
    <FacetSection title={m.search_facet_language()}>
      <FacetCheckList
        group="doc_lang"
        items={languageItems}
        selected={filters.language === null ? [] : [filters.language]}
        onToggle={(value: string) => {
          onChange({ ...filters, language: filters.language === value ? null : value });
        }}
      />
    </FacetSection>
  {/if}
</div>
