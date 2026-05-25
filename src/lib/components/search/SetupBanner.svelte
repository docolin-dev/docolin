<script lang="ts">
  import { m } from "$paraglide/messages";
  import { Checkbox } from "$lib/components/ui/checkbox";

  interface Props {
    tags: string[];
    tuned: boolean;
    onToggle: () => void;
    onReset: () => void;
  }

  let { tags, tuned, onToggle, onReset }: Props = $props();
</script>

<div
  class="border-foreground/10 bg-muted/20 flex flex-wrap items-center gap-x-3 gap-y-2 border px-3 py-2 text-xs"
>
  <div class="flex items-center gap-2">
    <Checkbox
      id="search-setup-tune"
      checked={tuned}
      onCheckedChange={() => {
        onToggle();
      }}
    />
    <label for="search-setup-tune" class="text-foreground cursor-pointer">
      {m.search_setup_tuned()}
    </label>
  </div>

  <div class="flex flex-wrap items-center gap-1.5">
    {#each tags as tag (tag)}
      <span class="border-primary/40 text-primary bg-primary/5 border px-1.5 py-0.5 font-mono">
        {tag}
      </span>
    {/each}
  </div>

  <button
    type="button"
    onclick={() => {
      onReset();
    }}
    class="text-muted-foreground hover:text-primary ml-auto underline-offset-2 transition-colors hover:underline"
  >
    {m.search_setup_reset()}
  </button>
</div>
