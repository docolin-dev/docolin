<script lang="ts">
  import { slide } from "svelte/transition";
  import { m } from "$paraglide/messages";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import X from "@lucide/svelte/icons/x";
  import ImageOff from "@lucide/svelte/icons/image-off";
  import Unlink from "@lucide/svelte/icons/unlink";
  import type { PreviewWarning } from "$lib/preview/render-doco";

  // A floating "problems" button, bottom-right, that expands into a debug
  // console listing this doco's soft warnings (broken links, missing images).
  // Hidden entirely when there are none, prominent when there are.
  let { warnings }: { warnings: PreviewWarning[] } = $props();

  let open = $state(false);
  // Collapse when the doco changes and the new one is clean.
  $effect(() => {
    if (warnings.length === 0) open = false;
  });

  function label(w: PreviewWarning): string {
    return w.kind === "missing-image"
      ? m.preview_warning_missing_image()
      : m.preview_warning_broken_link();
  }
</script>

{#if warnings.length > 0}
  <div class="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2">
    {#if open}
      <div
        transition:slide={{ duration: 150 }}
        class="bg-popover ring-foreground/10 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg shadow-md ring-1"
      >
        <div class="border-foreground/10 flex items-center justify-between border-b px-3 py-2">
          <p class="text-foreground text-sm font-medium">
            {m.preview_problems_heading({ count: warnings.length })}
          </p>
          <button
            type="button"
            onclick={() => (open = false)}
            aria-label={m.preview_problems_close()}
            class="text-muted-foreground hover:text-foreground cursor-pointer p-1 transition-colors"
          >
            <X class="size-4" />
          </button>
        </div>
        <ul class="max-h-72 overflow-y-auto p-2">
          {#each warnings as w, i (`${String(i)}-${w.detail}`)}
            <li class="flex items-start gap-2 px-2 py-1.5 text-sm">
              {#if w.kind === "missing-image"}
                <ImageOff class="text-muted-foreground mt-0.5 size-4 shrink-0" />
              {:else}
                <Unlink class="text-muted-foreground mt-0.5 size-4 shrink-0" />
              {/if}
              <span class="min-w-0">
                <span class="text-foreground">{label(w)}</span>
                <span class="text-muted-foreground block font-mono text-xs break-all"
                  >{w.detail}</span
                >
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <button
      type="button"
      onclick={() => (open = !open)}
      class="inline-flex cursor-pointer items-center gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 shadow-md transition-colors hover:bg-amber-500/20"
    >
      <TriangleAlert class="size-4" />
      {m.preview_problems_button({ count: warnings.length })}
    </button>
  </div>
{/if}
