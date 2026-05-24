<script lang="ts">
  import { m } from "$paraglide/messages";
  import savanna1920 from "$lib/assets/hero/savanna-1920.webp";
  import savanna1280 from "$lib/assets/hero/savanna-1280.webp";
  import savanna768 from "$lib/assets/hero/savanna-768.webp";
  import { HOME_SEARCH_INPUT_ID } from "$lib/constants/home";

  let query = $state("");

  // Mac key-chip detection. typeof guard makes this safe during SSR (where
  // navigator is undefined); on the client the value flips to true for Apple
  // user agents during hydration.
  const isMac = $derived(
    typeof navigator !== "undefined" &&
      (navigator.userAgent.includes("Mac") ||
        navigator.userAgent.includes("iPhone") ||
        navigator.userAgent.includes("iPad") ||
        navigator.userAgent.includes("iPod")),
  );

  const shortcutLabel = $derived(isMac ? "⌘K" : "Ctrl K");
  const searchPlaceholder = $derived(`${shortcutLabel}   ${m.home_hero_search_placeholder()}`);

  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    // Search isn't wired yet. Placeholder until the search route lands.
  }

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
  <picture aria-hidden="true" class="pointer-events-none absolute inset-0 -z-20 select-none">
    <source media="(min-width: 1280px)" srcset={savanna1920} />
    <source media="(min-width: 768px)" srcset={savanna1280} />
    <img
      src={savanna768}
      alt=""
      class="h-full w-full object-cover object-center"
      fetchpriority="high"
      decoding="async"
    />
  </picture>

  <div
    aria-hidden="true"
    class="from-background pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b to-transparent sm:h-40"
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

      <form onsubmit={handleSubmit} class="mx-auto mt-10 w-full max-w-2xl" role="search">
        <label for={HOME_SEARCH_INPUT_ID} class="sr-only">{m.home_hero_search_label()}</label>
        <input
          id={HOME_SEARCH_INPUT_ID}
          type="search"
          bind:value={query}
          placeholder={searchPlaceholder}
          autocomplete="off"
          spellcheck="false"
          class="border-foreground/10 bg-background/50 placeholder:text-foreground/45 hover:bg-background/65 focus:bg-background/85 w-full appearance-none border px-5 py-3 text-base shadow-[0_4px_24px_-12px_rgb(0_0_0_/_0.2)] backdrop-blur-xl transition-colors outline-none focus:ring-0 sm:text-lg"
        />
      </form>
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
