<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { m } from "$paraglide/messages";
  import { localizeHref, getLocale } from "$paraglide/runtime";
  import FolderInput from "@lucide/svelte/icons/folder-input";
  import FolderPlus from "@lucide/svelte/icons/folder-plus";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Lock from "@lucide/svelte/icons/lock";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Info from "@lucide/svelte/icons/info";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import PreviewOpenDialog from "$lib/components/preview/PreviewOpenDialog.svelte";
  import PreviewBraveHelp from "$lib/components/preview/PreviewBraveHelp.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { detectCapabilities, isBrave, type PreviewCapabilities } from "$lib/preview/capabilities";
  import { listProjects, removeProject, type PreviewProjectMeta } from "$lib/preview/project-store";
  import {
    pickDirectoryPending,
    uploadPending,
    type PendingSource,
  } from "$lib/preview/open-folder";
  import { firstDocoPath } from "$lib/preview/import-project";
  import type { PreviewSession } from "$lib/preview/preview-session";
  import { renderMarkdownPreview } from "$lib/markdown-shared";

  let caps = $state<PreviewCapabilities>({
    fileSystemAccess: false,
    folderUpload: false,
    chromium: false,
    mobile: false,
  });
  let brave = $state(false);
  let projects = $state<PreviewProjectMeta[]>([]);
  let uploadInput = $state<HTMLInputElement | null>(null);
  let busy = $state(false);

  // A picked folder waiting on the "where are your docos" step.
  let pending = $state<PendingSource | null>(null);
  let dialogOpen = $state(false);
  let helpOpen = $state(false);

  // Either way to read a local folder is available, so the open card works.
  const canOpen = $derived(caps.fileSystemAccess || caps.folderUpload);
  // Chromium with the File System Access API switched off (Brave, or a disabled
  // flag): upload still works, so this is a notice, not a wall.
  const fsBlockedChromium = $derived(!caps.mobile && caps.chromium && !caps.fileSystemAccess);

  onMount(() => {
    caps = detectCapabilities();
    projects = listProjects();
    void isBrave().then((b) => (brave = b));
    // Warm the markdown renderer (Shiki + the pipeline lazy-load on first use)
    // while the user picks, so the first doco renders instantly.
    void renderMarkdownPreview("");
  });

  // The open card: pick a folder (live, Chromium) or fall back to upload, then
  // hand the pending source to the dialog for the subpath + import step.
  async function openSource(): Promise<void> {
    if (busy) return;
    if (caps.fileSystemAccess) {
      busy = true;
      const picked = await pickDirectoryPending();
      busy = false;
      if (picked === null) return; // picker dismissed
      pending = picked;
      dialogOpen = true;
    } else {
      uploadInput?.click();
    }
  }

  function onUpload(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files === null ? [] : [...input.files];
    input.value = "";
    if (files.length === 0) return;
    pending = uploadPending(files);
    dialogOpen = true;
  }

  async function onOpened(session: PreviewSession): Promise<void> {
    const path = firstDocoPath(session.project);
    await goto(localizeHref(`/preview/${session.meta.id}/${path ?? ""}`));
  }

  function retryFs(): void {
    caps = detectCapabilities();
    if (caps.fileSystemAccess) helpOpen = false;
  }

  async function remove(id: string): Promise<void> {
    await removeProject(id);
    projects = listProjects();
  }

  const relative = $derived(new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }));
  function lastOpened(ts: number): string {
    const mins = Math.round((ts - Date.now()) / 60000);
    if (Math.abs(mins) < 60) return relative.format(mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return relative.format(hours, "hour");
    return relative.format(Math.round(hours / 24), "day");
  }
</script>

<svelte:head>
  <title>{m.preview_overview_title()} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<DocoViewerNavbar kindSegments={[]} />

<div class="mx-auto max-w-4xl px-6 pt-24 pb-16">
  <h1 class="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
    {m.preview_overview_title()}
  </h1>
  <p class="text-muted-foreground mt-3 text-lg leading-relaxed">{m.preview_overview_subtitle()}</p>
  <p class="text-muted-foreground mt-3 inline-flex items-center gap-1.5 text-sm">
    <Lock class="size-3.5" />
    {m.preview_overview_privacy()}
  </p>

  {#if caps.mobile}
    <div class="border-foreground/15 mt-8 flex items-start gap-3 border p-5">
      <Monitor class="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <div>
        <p class="text-foreground font-medium">{m.preview_desktop_only_title()}</p>
        <p class="text-muted-foreground mt-1 text-sm">{m.preview_desktop_only_body()}</p>
      </div>
    </div>
  {:else}
    <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
      {#each projects as p (p.id)}
        <div class="relative">
          <a
            href={localizeHref(`/preview/${p.id}/${p.lastPath ?? ""}`)}
            class="bg-background border-foreground/15 hover:border-primary group flex h-full flex-col border p-6 transition-colors"
          >
            <div class="flex items-center gap-3 pr-8">
              <span
                class="bg-muted text-muted-foreground inline-flex size-10 shrink-0 items-center justify-center"
              >
                <FolderInput class="size-5" />
              </span>
              <h3 class="text-foreground truncate text-lg font-medium tracking-tight">{p.name}</h3>
            </div>
            <div
              class="text-muted-foreground mt-auto flex items-center justify-between gap-3 pt-6 text-sm"
            >
              <span class="flex min-w-0 items-center gap-2">
                {#if p.mode === "upload"}
                  <span
                    class="shrink-0 border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                  >
                    {m.preview_snapshot_badge()}
                  </span>
                {/if}
                <span class="truncate">
                  {m.preview_card_opened({ when: lastOpened(p.lastOpenedAt) })}
                  · {p.subpath === null ? m.preview_subpath_whole() : `${p.subpath}/`}
                </span>
              </span>
              <ArrowRight
                class="text-muted-foreground/50 group-hover:text-primary size-4 shrink-0 transition-all group-hover:translate-x-0.5"
              />
            </div>
          </a>
          <button
            type="button"
            onclick={() => void remove(p.id)}
            aria-label={m.preview_remove_project()}
            title={m.preview_remove_project()}
            class="text-muted-foreground hover:text-destructive absolute top-4 right-4 cursor-pointer p-1 transition-colors"
          >
            <Trash2 class="size-4" />
          </button>
        </div>
      {/each}

      {#if canOpen}
        <button
          type="button"
          onclick={() => void openSource()}
          class="bg-background border-foreground/30 hover:border-primary group flex flex-col items-center justify-center gap-3 border-2 border-dashed p-6 text-center transition-colors hover:cursor-pointer sm:p-7"
        >
          <span
            class="bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary inline-flex size-10 items-center justify-center transition-colors"
          >
            <FolderPlus class="size-5" />
          </span>
          <p class="text-foreground text-base font-medium">{m.preview_open_card_title()}</p>
          <p class="text-muted-foreground max-w-[22rem] text-sm leading-relaxed">
            {m.preview_open_card_body()}
          </p>
        </button>
      {/if}
    </div>

    {#if !canOpen}
      <p class="text-muted-foreground mt-6 text-sm">{m.preview_unsupported()}</p>
    {:else if fsBlockedChromium}
      <div class="border-foreground/15 mt-6 flex items-start gap-3 border p-4">
        <Info class="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div class="min-w-0 text-sm">
          <p class="text-muted-foreground">{m.preview_fs_blocked_notice()}</p>
          {#if brave}
            <button
              type="button"
              onclick={() => (helpOpen = true)}
              class="text-foreground mt-1 cursor-pointer underline underline-offset-4 hover:no-underline"
            >
              {m.preview_fs_blocked_enable()}
            </button>
          {/if}
        </div>
      </div>
    {:else if caps.folderUpload && !caps.fileSystemAccess}
      <p class="text-muted-foreground mt-6 text-sm">{m.preview_upload_only_hint()}</p>
    {:else if caps.fileSystemAccess && caps.folderUpload}
      <p class="text-muted-foreground mt-6 text-sm">
        {m.preview_upload_alt_prefix()}
        <button
          type="button"
          onclick={() => uploadInput?.click()}
          class="text-foreground cursor-pointer underline underline-offset-4 hover:no-underline"
        >
          {m.preview_upload_alt_link()}
        </button>
      </p>
    {/if}
  {/if}

  <input
    bind:this={uploadInput}
    type="file"
    {...{ webkitdirectory: true }}
    onchange={onUpload}
    class="hidden"
  />
</div>

<PreviewOpenDialog
  bind:open={dialogOpen}
  {pending}
  onOpened={(s: PreviewSession) => void onOpened(s)}
/>

{#if brave}
  <Dialog.Root bind:open={helpOpen}>
    <Dialog.Content class="sm:max-w-lg">
      <Dialog.Header>
        <Dialog.Title>{m.preview_brave_title()}</Dialog.Title>
      </Dialog.Header>
      <PreviewBraveHelp onRetry={retryFs} />
    </Dialog.Content>
  </Dialog.Root>
{/if}
