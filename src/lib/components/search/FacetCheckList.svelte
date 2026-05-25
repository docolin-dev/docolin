<script lang="ts">
  import { m } from "$paraglide/messages";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import type { FacetItem } from "./types";

  interface Props {
    /** Stable prefix for input ids (the facet key, e.g. "type"). */
    group: string;
    items: FacetItem[];
    selected: string[];
    onToggle: (value: string) => void;
    /** Collapse the list past this many items behind a show-more toggle. */
    collapseAfter?: number;
  }

  let { group, items, selected, onToggle, collapseAfter }: Props = $props();

  let expanded = $state(false);
  const selectedSet = $derived(new Set(selected));
  const limit = $derived(collapseAfter ?? items.length);
  // Always keep checked items visible even when collapsed, so a selection never
  // hides behind "show more".
  const visible = $derived(
    expanded ? items : items.filter((item, i) => i < limit || selectedSet.has(item.value)),
  );
  const hiddenCount = $derived(items.length - visible.length);
</script>

<div class="flex flex-col">
  {#each visible as item (item.value)}
    <div class="flex items-center gap-2 py-1">
      <Checkbox
        id={`facet-${group}-${item.value}`}
        checked={selectedSet.has(item.value)}
        onCheckedChange={() => {
          onToggle(item.value);
        }}
      />
      <label
        for={`facet-${group}-${item.value}`}
        class="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-sm"
      >
        <span class="text-foreground truncate">{item.label}</span>
        <span class="text-muted-foreground shrink-0 text-xs tabular-nums">{item.count}</span>
      </label>
    </div>
  {/each}

  {#if hiddenCount > 0 && !expanded}
    <button
      type="button"
      onclick={() => {
        expanded = true;
      }}
      class="text-muted-foreground hover:text-primary mt-1 self-start text-xs transition-colors"
    >
      {m.search_show_more()}
    </button>
  {:else if expanded && collapseAfter !== undefined && items.length > collapseAfter}
    <button
      type="button"
      onclick={() => {
        expanded = false;
      }}
      class="text-muted-foreground hover:text-primary mt-1 self-start text-xs transition-colors"
    >
      {m.search_show_less()}
    </button>
  {/if}
</div>
