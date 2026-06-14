<script lang="ts">
  import { m } from "$paraglide/messages";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  // Brave disables the File System Access API by default. Rather than dead-end
  // the user, walk them through enabling the flag (they can't be linked to an
  // internal brave:// page, so they paste it), then retry.
  let { onRetry }: { onRetry: () => void } = $props();

  const FLAG = "brave://flags/#file-system-access-api";
  let copied = $state(false);
  async function copyFlag(): Promise<void> {
    try {
      await navigator.clipboard.writeText(FLAG);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // Clipboard blocked; the URL is shown for manual copy anyway.
    }
  }
</script>

<p class="text-muted-foreground text-sm">{m.preview_brave_intro()}</p>

<div class="border-foreground/15 mt-5 border p-5">
  <p class="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
    {m.preview_brave_eyebrow()}
  </p>
  <ol class="mt-4 flex flex-col gap-4">
    <li class="flex gap-4">
      <span class="text-muted-foreground font-mono text-sm">01</span>
      <div class="min-w-0 flex-1">
        <p class="text-foreground text-sm">{m.preview_brave_step1()}</p>
        <div
          class="border-foreground/15 mt-2 flex items-center justify-between gap-3 border px-3 py-2"
        >
          <code class="text-foreground min-w-0 truncate text-sm">{FLAG}</code>
          <button
            type="button"
            onclick={() => void copyFlag()}
            class="text-muted-foreground hover:text-foreground inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-sm transition-colors"
          >
            {#if copied}
              <Check class="size-3.5" />
              {m.preview_error_copied()}
            {:else}
              <Copy class="size-3.5" />
              {m.preview_brave_copy()}
            {/if}
          </button>
        </div>
        <p class="text-muted-foreground mt-1.5 text-xs">{m.preview_brave_step1_note()}</p>
      </div>
    </li>
    <li class="flex gap-4">
      <span class="text-muted-foreground font-mono text-sm">02</span>
      <p class="text-foreground text-sm">{m.preview_brave_step2()}</p>
    </li>
    <li class="flex gap-4">
      <span class="text-muted-foreground font-mono text-sm">03</span>
      <p class="text-foreground text-sm">{m.preview_brave_step3()}</p>
    </li>
    <li class="flex gap-4">
      <span class="text-muted-foreground font-mono text-sm">04</span>
      <p class="text-foreground text-sm">{m.preview_brave_step4()}</p>
    </li>
  </ol>
</div>

<button
  type="button"
  onclick={onRetry}
  class="bg-primary text-primary-foreground hover:bg-primary/90 mt-5 inline-flex h-10 cursor-pointer items-center gap-2 px-4 text-sm font-medium transition-colors"
>
  <RefreshCw class="size-4" />
  {m.preview_brave_retry()}
</button>
