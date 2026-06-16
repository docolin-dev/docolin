<script lang="ts">
  import { onMount } from "svelte";
  import { m } from "$paraglide/messages";
  import { goto } from "$app/navigation";
  import { localizeHref, getLocale } from "$paraglide/runtime";
  import { commandPalette } from "$lib/client/command-palette.svelte";
  // Two paired heroes: a daytime savanna for light mode, a starlit one for dark.
  // Both are prerendered into the DOM and CSS picks which shows (dark:hidden /
  // hidden dark:block), so flipping the theme swaps the art instantly with no
  // fetch. A tiny LQIP (Vite base64-inlines assets under 4KB) paints with the HTML
  // so a blurred frame shows immediately, then the full-quality image lands on top:
  // smaller first, quality over load time. mode-watcher sets `.dark` before first
  // paint, so the correct image is chosen on frame one with no flash.
  import dayLqip from "$lib/assets/hero/savanna-day-lqip.webp";
  import day768 from "$lib/assets/hero/savanna-day-768.webp";
  import day1280 from "$lib/assets/hero/savanna-day-1280.webp";
  import day2048 from "$lib/assets/hero/savanna-day-2048.webp";
  import nightLqip from "$lib/assets/hero/savanna-night-lqip.webp";
  import night768 from "$lib/assets/hero/savanna-night-768.webp";
  import night1280 from "$lib/assets/hero/savanna-night-1280.webp";
  import night2048 from "$lib/assets/hero/savanna-night-2048.webp";
  import { HOME_SEARCH_INPUT_ID } from "$lib/constants/home";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import CornerDownLeft from "@lucide/svelte/icons/corner-down-left";

  // The hero search is the homepage's single search surface: type and matching
  // guides appear in a panel directly under the input (no modal). ⌘K focuses
  // this input instead of opening the global palette (registered below), and any
  // printable keypress focuses it too, so a visitor can just start typing.

  interface HeroResult {
    title: string;
    href: string;
    kindPath: string;
    pangoScore: number | null;
  }

  let query = $state("");
  let results = $state<HeroResult[]>([]);
  let loading = $state(false);
  let focused = $state(false);
  // -1 = nothing selected: a plain Enter opens /search (search-box model). The
  // reader picks a specific result by arrowing/tabbing to it, or clicking.
  let highlighted = $state(-1);
  let inputEl = $state<HTMLInputElement | null>(null);
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;

  const trimmed = $derived(query.trim());
  const panelOpen = $derived(focused && trimmed.length > 0);
  const seeAllHref = $derived(`/search?q=${encodeURIComponent(trimmed)}`);
  // Selectable rows: each result, then the always-present "see all" row.
  const itemCount = $derived(results.length + 1);

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
      const params = new URLSearchParams({ q, mode: "lexical", limit: "5", lang: getLocale() });
      const res = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
      if (res.ok) {
        const data = (await res.json()) as { results: HeroResult[] };
        results = data.results;
        highlighted = -1;
      }
    } catch {
      // Aborted (newer keystroke) or offline: keep the last results on screen.
    } finally {
      loading = false;
    }
  }

  // Debounced lexical fetch as the visitor types (the instant path).
  $effect(() => {
    const q = query;
    clearTimeout(debounce);
    debounce = setTimeout(() => void runSearch(q), 120);
  });

  function navigateTo(href: string): void {
    void goto(localizeHref(href));
  }

  function onInputKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      inputEl?.blur();
      return;
    }
    if (trimmed.length === 0) {
      if (event.key === "Enter") event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      highlighted = Math.min(highlighted + 1, itemCount - 1);
    } else if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      event.preventDefault();
      highlighted = Math.max(highlighted - 1, -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // A plain Enter (nothing picked) opens the full results page; a picked
      // result (via arrow/tab) navigates straight to that guide.
      if (highlighted >= 0 && highlighted < results.length) {
        navigateTo(results[highlighted].href);
      } else {
        navigateTo(seeAllHref);
      }
    }
  }

  // Enter that escapes the keydown handler still goes to the full results page.
  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    if (trimmed.length > 0) navigateTo(seeAllHref);
  }

  onMount(() => {
    // ⌘K focuses this input instead of opening the modal (one surface here), and
    // a printable keypress anywhere on the homepage focuses it (type-to-search).
    commandPalette.focusOverride = () => inputEl?.focus();
    const onGlobalKeydown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
      ) {
        return;
      }
      inputEl?.focus();
    };
    document.addEventListener("keydown", onGlobalKeydown);
    return () => {
      commandPalette.focusOverride = null;
      document.removeEventListener("keydown", onGlobalKeydown);
    };
  });

  // Big-pixel ordered dither. Square cells light up via a noise function
  // whose density climbs from sparse at the top to fully covered toward the
  // bottom, with the last two rows hard-set to a solid bar so the savanna
  // image fades into the white section underneath through a chunky 8-bit
  // transition with a clean edge.
  const CELL = 16;
  const VIEW_W = 1920;
  const DITHER_ROWS = 4;
  const SOLID_ROWS = 2;
  const TOTAL_ROWS = DITHER_ROWS + SOLID_ROWS;
  const VIEW_H = TOTAL_ROWS * CELL;
  const COLS = Math.floor(VIEW_W / CELL);

  function generatePixelDither(seed: number): { x: number; y: number }[] {
    let s = seed >>> 0;
    const rand = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    const cells: { x: number; y: number }[] = [];
    for (let r = 0; r < DITHER_ROWS; r++) {
      // y is 1/DITHER_ROWS at top, 1 at bottom; pow steepens the climb to dense.
      const yFrac = (r + 1) / DITHER_ROWS;
      const density = Math.pow(yFrac, 1.6);
      for (let c = 0; c < COLS; c++) {
        if (rand() < density) cells.push({ x: c * CELL, y: r * CELL });
      }
    }
    return cells;
  }

  const cells = generatePixelDither(42);
  const solidY = DITHER_ROWS * CELL;
  const solidHeight = SOLID_ROWS * CELL;
</script>

<section class="relative isolate overflow-hidden">
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-20 select-none">
    <!-- Daytime savanna (light mode). The blurred LQIP sits behind the full image
         and shows until it lands; scale-110 hides the blur's soft edges.
         object-bottom anchors Pango + the horizon, so a tall viewport crops the
         empty sky off the top rather than cutting the pangolin off the bottom. -->
    <div class="absolute inset-0 dark:hidden">
      <div
        class="absolute inset-0 scale-110 bg-cover bg-bottom blur-2xl"
        style="background-image: url('{dayLqip}')"
      ></div>
      <picture>
        <source media="(min-width: 1280px)" srcset={day2048} />
        <source media="(min-width: 768px)" srcset={day1280} />
        <img
          src={day768}
          alt=""
          class="absolute inset-0 h-full w-full object-cover object-bottom"
          fetchpriority="high"
          decoding="async"
        />
      </picture>
    </div>
    <!-- Starlit savanna (dark mode). -->
    <div class="absolute inset-0 hidden dark:block">
      <div
        class="absolute inset-0 scale-110 bg-cover bg-bottom blur-2xl"
        style="background-image: url('{nightLqip}')"
      ></div>
      <picture>
        <source media="(min-width: 1280px)" srcset={night2048} />
        <source media="(min-width: 768px)" srcset={night1280} />
        <img
          src={night768}
          alt=""
          class="absolute inset-0 h-full w-full object-cover object-bottom"
          fetchpriority="high"
          decoding="async"
        />
      </picture>
    </div>
  </div>

  <!-- Softens the top of the bright day sky under the floating navbar. Hidden in
       dark mode: the night sky is already near-background there, so the fade is
       invisible anyway, and a dark-to-transparent gradient visibly bands in the
       dark tonal range (CSS gradient banding, not the image). -->
  <div
    aria-hidden="true"
    class="from-background pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b to-transparent sm:h-40 dark:hidden"
  ></div>

  <div class="relative flex min-h-[105svh] flex-col items-center px-6 pt-[20svh] pb-16 text-center">
    <div class="mx-auto w-full max-w-5xl">
      <p
        class="text-foreground/70 mb-8 font-mono text-[11px] tracking-[0.22em] uppercase sm:text-xs"
      >
        {m.home_hero_eyebrow()}
      </p>

      <h1
        class="text-foreground text-5xl leading-[0.95] font-semibold tracking-[-0.03em] text-balance sm:text-6xl md:text-7xl lg:text-[5.5rem]"
      >
        {m.home_hero_title_pre()}<span class="text-primary">{m.home_hero_title_emph()}</span
        >{m.home_hero_title_post()}
      </h1>

      <p class="text-foreground/80 mx-auto mt-7 max-w-xl text-base text-balance sm:mt-8 sm:text-lg">
        {m.home_hero_subtitle()}
      </p>

      <div class="relative mx-auto mt-10 w-full max-w-2xl">
        <form onsubmit={handleSubmit} role="search">
          <label for={HOME_SEARCH_INPUT_ID} class="sr-only">{m.home_hero_search_label()}</label>
          <input
            bind:this={inputEl}
            id={HOME_SEARCH_INPUT_ID}
            type="search"
            bind:value={query}
            onfocus={() => {
              focused = true;
            }}
            onblur={() => {
              focused = false;
            }}
            onkeydown={onInputKeydown}
            placeholder={m.home_hero_search_placeholder()}
            autocomplete="off"
            spellcheck="false"
            role="combobox"
            aria-expanded={panelOpen}
            aria-controls="hero-search-panel"
            aria-autocomplete="list"
            class="border-foreground/10 bg-background/50 placeholder:text-foreground/45 hover:bg-background/65 focus:bg-background/85 w-full appearance-none border px-5 py-3 text-base shadow-[0_4px_24px_-12px_rgb(0_0_0_/_0.2)] backdrop-blur-xl transition-colors outline-none focus:ring-0 sm:text-lg"
          />
        </form>

        {#if panelOpen}
          <!-- mousedown preventDefault keeps the input focused while clicking a
               result, so the panel doesn't blur-close before the click lands. -->
          <div
            id="hero-search-panel"
            role="listbox"
            tabindex="-1"
            aria-label={m.home_hero_search_label()}
            onmousedown={(event) => {
              event.preventDefault();
            }}
            class="border-foreground/10 bg-background absolute inset-x-0 top-full z-30 mt-2 max-h-[min(20rem,55dvh)] overflow-y-auto border text-left shadow-[0_12px_32px_-12px_rgb(0_0_0_/_0.25)]"
          >
            {#if loading && results.length === 0}
              <p class="text-muted-foreground px-4 py-6 text-center text-sm">
                {m.search_palette_loading()}
              </p>
            {/if}

            {#if !loading && results.length === 0}
              <p class="text-muted-foreground px-4 py-6 text-center text-sm">
                {m.search_palette_empty()}
              </p>
            {/if}

            {#each results as result, i (result.href)}
              <a
                href={localizeHref(result.href)}
                role="option"
                aria-selected={highlighted === i}
                onmouseenter={() => {
                  highlighted = i;
                }}
                class="flex items-center gap-3 px-4 py-2 transition-colors {highlighted === i
                  ? 'bg-foreground/10'
                  : ''}"
              >
                <span class="text-foreground truncate text-sm">{result.title}</span>
                <span
                  class="text-muted-foreground ml-auto hidden max-w-[18rem] shrink-0 truncate font-mono text-xs sm:inline"
                >
                  {result.kindPath}
                </span>
                {#if result.pangoScore !== null}
                  <span
                    class="text-primary inline-flex shrink-0 items-center gap-1 font-mono text-xs"
                  >
                    <PawPrint class="size-3.5" />
                    {result.pangoScore}
                  </span>
                {/if}
              </a>
            {/each}

            <a
              href={localizeHref(seeAllHref)}
              role="option"
              aria-selected={highlighted === results.length}
              onmouseenter={() => {
                highlighted = results.length;
              }}
              class="text-muted-foreground flex items-center gap-2 border-t px-4 py-2.5 text-sm transition-colors {highlighted ===
              results.length
                ? 'bg-foreground/10'
                : ''}"
            >
              <CornerDownLeft class="size-4 shrink-0" />
              <span class="truncate">{m.search_palette_view_all({ query: trimmed })}</span>
            </a>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="relative -mt-px h-14 w-full sm:h-20 md:h-24">
    <svg
      aria-hidden="true"
      viewBox="0 0 {VIEW_W} {VIEW_H}"
      preserveAspectRatio="xMidYMax slice"
      shape-rendering="crispEdges"
      class="pointer-events-none absolute inset-0 block h-full w-full"
    >
      {#each cells as cell (`${cell.x.toString()}-${cell.y.toString()}`)}
        <rect
          x={cell.x}
          y={cell.y}
          width={CELL}
          height={CELL}
          fill="currentColor"
          class="text-background"
        />
      {/each}
      <rect
        x="0"
        y={solidY}
        width={VIEW_W}
        height={solidHeight}
        fill="currentColor"
        class="text-background"
      />
    </svg>
  </div>
</section>
