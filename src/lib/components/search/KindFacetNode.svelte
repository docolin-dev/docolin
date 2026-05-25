<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Self from "./KindFacetNode.svelte";
  import type { KindNode } from "./kind-tree";

  interface Props {
    node: KindNode;
    depth: number;
    /** The selected kind subtree as an ltree path, or null. */
    selected: string | null;
    onSelect: (ltreePath: string) => void;
  }

  let { node, depth, selected, onSelect }: Props = $props();

  const hasChildren = $derived(node.children.length > 0);
  const isSelected = $derived(selected === node.path);
  // Open roots by default, plus any node on the path to a deep-linked selection,
  // until the reader toggles it (then their choice wins).
  const containsSelected = $derived(selected?.startsWith(`${node.path}.`) ?? false);
  let userOpen = $state<boolean | null>(null);
  const open = $derived(userOpen ?? (depth < 1 || containsSelected));
</script>

<div>
  <div class="flex items-center" style:padding-left="{depth * 14}px">
    {#if hasChildren}
      <button
        type="button"
        aria-label={node.label}
        aria-expanded={open}
        onclick={() => {
          userOpen = !open;
        }}
        class="text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center transition-colors"
      >
        <ChevronRight class="size-3.5 transition-transform {open ? 'rotate-90' : ''}" />
      </button>
    {:else}
      <span class="size-5 shrink-0"></span>
    {/if}
    <button
      type="button"
      aria-pressed={isSelected}
      onclick={() => {
        onSelect(node.path);
      }}
      class="flex min-w-0 flex-1 items-center justify-between gap-2 py-1 text-left text-sm transition-colors {isSelected
        ? 'text-primary font-medium'
        : 'text-foreground hover:text-primary'}"
    >
      <span class="truncate">{node.label}</span>
      <span class="text-muted-foreground shrink-0 text-xs tabular-nums">{node.count}</span>
    </button>
  </div>

  {#if open && hasChildren}
    {#each node.children as child (child.path)}
      <Self node={child} depth={depth + 1} {selected} {onSelect} />
    {/each}
  {/if}
</div>
