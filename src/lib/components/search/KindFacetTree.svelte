<script lang="ts">
  import KindFacetNode from "./KindFacetNode.svelte";
  import type { KindNode } from "./kind-tree";

  interface Props {
    nodes: KindNode[];
    /** The selected kind subtree as an ltree path, or null for all topics. */
    selected: string | null;
    onSelect: (ltreePath: string) => void;
  }

  let { nodes, selected, onSelect }: Props = $props();
</script>

<div class="flex flex-col">
  {#each nodes as node (node.path)}
    <KindFacetNode {node} depth={0} {selected} {onSelect} />
  {/each}
</div>
