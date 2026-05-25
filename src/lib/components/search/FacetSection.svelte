<script lang="ts">
  import type { Snippet } from "svelte";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  interface Props {
    title: string;
    /** Whether the section starts expanded. */
    open?: boolean;
    children: Snippet;
  }

  let { title, open = true, children }: Props = $props();
</script>

<details {open} class="group border-foreground/10 border-b">
  <summary
    class="text-foreground hover:text-primary flex cursor-pointer list-none items-center justify-between gap-2 py-3 text-sm font-medium transition-colors select-none [&::-webkit-details-marker]:hidden"
  >
    <span>{title}</span>
    <ChevronDown class="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
  </summary>
  <div class="pb-3">
    {@render children()}
  </div>
</details>
