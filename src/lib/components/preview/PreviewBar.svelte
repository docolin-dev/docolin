<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import FolderTree from "@lucide/svelte/icons/folder-tree";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { normalizeSubpath } from "$lib/preview/open-folder";
  import type { PreviewProjectMeta } from "$lib/preview/project-store";

  // A small status pill, bottom-left (opposite the problems console): the project
  // name, an inline switcher to retype which subfolder is the docs root (any
  // depth, like the open dialog), and a live-reload refresh or "snapshot" badge.
  let {
    meta,
    refreshing,
    onRefresh,
    onChangeSubpath,
  }: {
    meta: PreviewProjectMeta;
    refreshing: boolean;
    onRefresh: () => void;
    onChangeSubpath: (subpath: string | null) => void;
  } = $props();

  let switcherOpen = $state(false);
  let draft = $state("");

  // Seed the field from the current subpath each time the switcher opens.
  let wasOpen = false;
  $effect(() => {
    if (switcherOpen && !wasOpen) draft = meta.subpath ?? "";
    wasOpen = switcherOpen;
  });

  function apply(): void {
    onChangeSubpath(normalizeSubpath(draft));
    switcherOpen = false;
  }
</script>

<div
  class="bg-popover ring-foreground/10 fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-md ring-1"
>
  <a
    href={localizeHref("/preview")}
    title={m.preview_bar_projects()}
    class="text-muted-foreground hover:text-foreground transition-colors"
  >
    <FolderOpen class="size-4" />
  </a>
  <span class="text-foreground max-w-32 truncate font-medium">{meta.name}</span>

  <DropdownMenu.Root bind:open={switcherOpen}>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          title={m.preview_subpath_switch()}
          class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 transition-colors"
        >
          <FolderTree class="size-3.5" />
          <span class="font-mono text-xs">
            {meta.subpath === null ? m.preview_subpath_whole() : `${meta.subpath}/`}
          </span>
          <ChevronDown class="size-3" />
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" class="w-64 p-3" preventScroll={false}>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        class="flex flex-col gap-2"
      >
        <label for="preview-bar-subpath" class="text-foreground text-xs font-medium">
          {m.preview_open_subpath_label()}
        </label>
        <Input
          id="preview-bar-subpath"
          bind:value={draft}
          placeholder="docs/"
          class="h-9 font-mono"
          onkeydown={(e: KeyboardEvent) => {
            // Keep typing out of the menu's typeahead; Escape still closes it.
            if (e.key === "Escape") switcherOpen = false;
            else e.stopPropagation();
          }}
        />
        <p class="text-muted-foreground text-xs">{m.preview_open_subpath_hint()}</p>
        <div class="mt-1 flex justify-end">
          <Button type="submit" size="sm">{m.preview_subpath_apply()}</Button>
        </div>
      </form>
    </DropdownMenu.Content>
  </DropdownMenu.Root>

  {#if meta.mode === "upload"}
    <span
      title={m.preview_snapshot_hint()}
      class="border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700"
    >
      {m.preview_snapshot_badge()}
    </span>
  {:else}
    <button
      type="button"
      onclick={onRefresh}
      disabled={refreshing}
      title={m.preview_refresh()}
      aria-label={m.preview_refresh()}
      class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center transition-colors disabled:opacity-50"
    >
      <RefreshCw class="size-4 {refreshing ? 'animate-spin' : ''}" />
    </button>
  {/if}
</div>
