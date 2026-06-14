<script lang="ts">
  import { m } from "$paraglide/messages";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { normalizeSubpath, type PendingSource } from "$lib/preview/open-folder";
  import { removeProject } from "$lib/preview/project-store";
  import type { PreviewSession } from "$lib/preview/preview-session";

  // The "where do your docos live" step, shown right after a folder is picked or
  // uploaded: type the docs subfolder (any depth, like the sync screen), then
  // Open with a per-file progress bar. The import reads only that subtree; if it
  // holds no docos the dialog says so and lets you retype, no dead-end.
  let {
    open = $bindable(false),
    pending,
    onOpened,
  }: {
    open?: boolean;
    pending: PendingSource | null;
    onOpened: (session: PreviewSession) => void;
  } = $props();

  let subpathInput = $state("");
  let opening = $state(false);
  let progress = $state<{ done: number; total: number } | null>(null);
  let notFound = $state(false);

  // Reset each time the dialog opens.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      subpathInput = "";
      opening = false;
      progress = null;
      notFound = false;
    }
    wasOpen = open;
  });

  const pct = $derived(
    progress !== null && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0,
  );

  async function confirm(): Promise<void> {
    if (pending === null || opening) return;
    opening = true;
    notFound = false;
    progress = { done: 0, total: 0 };
    const session = await pending.open(normalizeSubpath(subpathInput), (done, total) => {
      progress = { done, total };
    });
    // Nothing matched the typed path: keep the dialog open so they can fix it,
    // and don't leave a docos-less project sitting in the recents grid.
    if (session.project.docos.size === 0 && session.project.errors.size === 0) {
      void removeProject(session.meta.id);
      opening = false;
      progress = null;
      notFound = true;
      return;
    }
    // The parent navigates to the first doco, which unmounts this dialog; leave
    // `opening` set so the controls stay disabled through the transition.
    onOpened(session);
  }
</script>

<Dialog.Root
  {open}
  onOpenChange={(v: boolean) => {
    if (!opening) open = v;
  }}
>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{m.preview_open_title({ folder: pending?.name ?? "" })}</Dialog.Title>
      <Dialog.Description>{m.preview_open_description()}</Dialog.Description>
    </Dialog.Header>

    <form
      onsubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
      class="flex flex-col gap-4"
    >
      <div class="flex flex-col gap-2">
        <label for="preview-subpath" class="text-sm font-medium">
          {m.preview_open_subpath_label()}
        </label>
        <Input
          id="preview-subpath"
          bind:value={subpathInput}
          oninput={() => (notFound = false)}
          disabled={opening}
          placeholder="docs/"
          class="h-11 font-mono"
        />
        <p class="text-muted-foreground text-xs">{m.preview_open_subpath_hint()}</p>
      </div>

      <!-- Progress / not-found: fixed height so swapping doesn't shift layout. -->
      <div class="flex min-h-9 flex-col justify-center gap-1.5">
        {#if opening && progress !== null}
          <div class="bg-muted h-1.5 w-full overflow-hidden">
            <div
              class="bg-primary h-full transition-[width] duration-150"
              style:width={`${pct.toString()}%`}
            ></div>
          </div>
          <span class="text-muted-foreground text-xs">
            {m.preview_open_converting({
              done: progress.done.toString(),
              total: progress.total.toString(),
            })}
          </span>
        {:else if notFound}
          <span class="text-destructive text-sm">{m.preview_open_no_docos()}</span>
        {/if}
      </div>

      <Dialog.Footer>
        <Button type="button" variant="ghost" disabled={opening} onclick={() => (open = false)}>
          {m.preview_cancel()}
        </Button>
        <Button type="submit" disabled={opening}>
          {opening ? m.preview_opening() : m.preview_open_action()}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
