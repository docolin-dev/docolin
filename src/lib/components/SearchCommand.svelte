<script lang="ts">
  import { onMount } from "svelte";
  import { afterNavigate, goto } from "$app/navigation";
  import { localizeHref, getLocale } from "$paraglide/runtime";
  import { m } from "$paraglide/messages";
  import * as Command from "$lib/components/ui/command";
  import * as Kbd from "$lib/components/ui/kbd";
  import { commandPalette } from "$lib/client/command-palette.svelte";
  import { isMacPlatform } from "$lib/client/platform";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import Search from "@lucide/svelte/icons/search";
  import CornerDownLeft from "@lucide/svelte/icons/corner-down-left";

  // The global ⌘K search palette, mounted once in the root layout. It runs the
  // cheap lexical path (no embedding) for instant as-you-type results; pressing
  // Enter on "view all" (or selecting nothing) jumps to /search for the full
  // hybrid results. Opened by ⌘K or any navbar's search button (via the shared
  // commandPalette store). Fixed result-area height so it never resizes as you
  // type, and a keyboard-hint footer so the keyboard-first nature is visible.

  interface PaletteResult {
    title: string;
    href: string;
    kindPath: string;
    appliesTo: string[];
    pangoScore: number | null;
  }

  let query = $state("");
  let results = $state<PaletteResult[]>([]);
  let loading = $state(false);
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;

  async function runSearch(raw: string): Promise<void> {
    const q = raw.trim();
    controller?.abort();
    if (q.length === 0) {
      results = [];
      loading = false;
      return;
    }
    controller = new AbortController();
    loading = true;
    try {
      const params = new URLSearchParams({ q, mode: "lexical", limit: "8", lang: getLocale() });
      const res = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
      if (res.ok) {
        const data = (await res.json()) as { results: PaletteResult[] };
        results = data.results;
      }
    } catch {
      // Aborted (newer keystroke) or offline: keep the last results on screen,
      // just drop the spinner in the finally block.
    } finally {
      loading = false;
    }
  }

  // Debounced lexical fetch as the reader types (the instant path).
  $effect(() => {
    const q = query;
    clearTimeout(debounce);
    debounce = setTimeout(() => void runSearch(q), 120);
  });

  // Reset when the palette closes so it reopens clean.
  $effect(() => {
    if (!commandPalette.open) {
      query = "";
      results = [];
      loading = false;
    }
  });

  const trimmed = $derived(query.trim());
  // Apple shows ⌘, everything else Ctrl. False on SSR, swaps after hydration.
  const isMac = $derived(isMacPlatform());

  function viewAll(): void {
    if (trimmed.length === 0) return;
    void goto(localizeHref(`/search?q=${encodeURIComponent(trimmed)}`));
  }

  onMount(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        // A page with its own search input (the homepage hero) routes ⌘K to that
        // input instead of opening the modal, so there's one surface per page.
        if (commandPalette.focusOverride !== null) {
          commandPalette.focusOverride();
        } else {
          commandPalette.open = !commandPalette.open;
        }
        return;
      }
      // Ctrl/Cmd+Enter while open jumps to the full /search results without
      // arrowing to the "view all" row. Capture phase so it beats the Command's
      // own Enter (which would select the highlighted result).
      if (commandPalette.open && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        viewAll();
      }
    };
    document.addEventListener("keydown", onKeydown, true);
    return () => {
      document.removeEventListener("keydown", onKeydown, true);
    };
  });

  // Any navigation (a result, or "view all") closes the palette.
  afterNavigate(() => {
    commandPalette.open = false;
  });
</script>

<!-- On a phone the palette sits near the top (top-4 matches the dialog's 1rem
     side inset) so the on-screen keyboard doesn't shove a vertically-centered
     modal off-screen; it recentres to top-1/4 from sm up. -->
<Command.Dialog
  bind:open={commandPalette.open}
  shouldFilter={false}
  class="top-4 sm:top-1/4 sm:max-w-2xl"
>
  <Command.Input bind:value={query} placeholder={m.search_palette_placeholder()} />

  <Command.List class="h-80 max-h-80">
    {#if trimmed.length === 0}
      <!-- Initial state: fills the reserved height so the palette never looks empty. -->
      <div
        class="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <Search class="size-6 opacity-40" />
        <p class="max-w-xs text-sm">{m.search_palette_prompt()}</p>
      </div>
    {:else}
      {#if loading && results.length === 0}
        <p class="text-muted-foreground px-3 py-6 text-center text-sm">
          {m.search_palette_loading()}
        </p>
      {/if}

      {#if !loading && results.length === 0}
        <p class="text-muted-foreground px-3 py-6 text-center text-sm">
          {m.search_palette_empty()}
        </p>
      {/if}

      {#if results.length > 0}
        <Command.Group>
          {#each results as result (result.href)}
            <Command.LinkItem
              href={localizeHref(result.href)}
              value={result.href}
              class="flex items-center justify-between gap-3 py-2"
            >
              <span class="flex min-w-0 flex-col">
                <span class="text-foreground truncate text-sm">{result.title}</span>
                <span class="text-muted-foreground truncate font-mono text-xs"
                  >{result.kindPath}</span
                >
              </span>
              <span class="flex shrink-0 items-center gap-3">
                {#if result.appliesTo.length > 0}
                  <span
                    class="text-muted-foreground hidden max-w-[14rem] truncate font-mono text-xs md:inline"
                  >
                    {result.appliesTo.slice(0, 3).join(" · ")}
                  </span>
                {/if}
                {#if result.pangoScore !== null}
                  <span
                    class="text-primary inline-flex items-center gap-1 font-mono text-xs"
                    title={m.search_result_pango({ score: String(result.pangoScore) })}
                  >
                    <PawPrint class="size-3.5" />
                    {result.pangoScore}
                  </span>
                {/if}
              </span>
            </Command.LinkItem>
          {/each}
        </Command.Group>
        <Command.Separator />
      {/if}

      <!-- Always selectable while typing: jump to /search for the full hybrid set. -->
      <Command.Item value="__view_all__" onSelect={viewAll} class="flex items-center gap-2">
        <CornerDownLeft class="size-4" />
        <span class="truncate">{m.search_palette_view_all({ query: trimmed })}</span>
      </Command.Item>
    {/if}
  </Command.List>

  <!-- Keyboard-hint footer: makes the keyboard-first nature visible (Raycast/Linear
       style). Hidden on touch-first small screens, where the hints are meaningless. -->
  <div
    class="border-input text-muted-foreground hidden items-center gap-4 border-t px-3 py-2 text-[11px] sm:flex"
  >
    <span class="inline-flex items-center gap-1">
      <Kbd.Root>↑</Kbd.Root><Kbd.Root>↓</Kbd.Root>
      {m.search_palette_navigate()}
    </span>
    <span class="inline-flex items-center gap-1">
      <Kbd.Root>↵</Kbd.Root>
      {m.search_palette_open()}
    </span>
    <span class="inline-flex items-center gap-1">
      <Kbd.Root>{isMac ? "⌘" : "Ctrl"}</Kbd.Root><Kbd.Root>↵</Kbd.Root>
      {m.search_palette_all()}
    </span>
    <span class="inline-flex items-center gap-1">
      <Kbd.Root>esc</Kbd.Root>
      {m.search_palette_close()}
    </span>
  </div>
</Command.Dialog>
