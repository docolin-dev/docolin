<script lang="ts">
  import { onMount } from "svelte";
  import { localizeHref } from "$paraglide/runtime";
  import { m } from "$paraglide/messages";
  import Search from "@lucide/svelte/icons/search";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import InboxBell from "$lib/components/InboxBell.svelte";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { commandPalette } from "$lib/client/command-palette.svelte";
  import { isMacPlatform } from "$lib/client/platform";
  import * as Kbd from "$lib/components/ui/kbd";

  // Public doco-page chrome. Mirrors the dashboard navbar's style and right-
  // side widget cluster so signed-in users have visual continuity between
  // reading docs and managing them. The left side carries the kind-path
  // breadcrumb instead of the URL breadcrumb, readers care about
  // categorical location ("you're in network/firewall stuff"), not source
  // location.
  //
  // Breadcrumb collapse: when the full kind path would run into the centered
  // search, leading segments fold into a single "…" one at a time (first one,
  // then two, ...) until only the leaf remains; if even the leaf is too wide its
  // text truncates. Driven by measuring a hidden full-width copy against the
  // space before the search (or the right cluster when the search is hidden), so
  // it collapses exactly as much as it needs to and no more.
  //
  // The center search button opens the shared ⌘K command palette.

  interface Props {
    kindSegments: string[];
    // When the page is scrolled to the very bottom, drop the backdrop blur
    // and go fully opaque: there's no scroll-past content to see through.
    atBottom?: boolean;
  }
  let { kindSegments, atBottom = false }: Props = $props();

  let navEl = $state<HTMLElement | null>(null);
  let crumbEl = $state<HTMLElement | null>(null);
  let searchEl = $state<HTMLElement | null>(null);
  let rightEl = $state<HTMLElement | null>(null);
  let measureEl = $state<HTMLElement | null>(null);

  // Leading kind segments folded into one "…". 0 = show the whole path.
  let hiddenCount = $state(0);
  let truncateLeaf = $state(false);
  let leafMaxPx = $state(0);

  const GAP_PX = 16; // breathing room kept before the obstacle on the right

  // Each segment links to its cumulative kind path (e.g. the "gpu" crumb of
  // hardware/gpu/nvidia -> /hardware/gpu), which renders that kind's browse page.
  const crumbs = $derived(
    kindSegments.map((slug, i) => ({ slug, href: `/${kindSegments.slice(0, i + 1).join("/")}` })),
  );
  const visibleCrumbs = $derived(crumbs.slice(hiddenCount));
  // Apple shows ⌘, everything else Ctrl. False on SSR, swaps after hydration.
  const isMac = $derived(isMacPlatform());

  function remeasure(): void {
    if (crumbEl === null || measureEl === null) return;
    if (kindSegments.length <= 1) {
      hiddenCount = 0;
      truncateLeaf = false;
      return;
    }
    // The obstacle is the centered search when it's shown, otherwise the right
    // widget cluster (search is hidden below md).
    const obstacle = searchEl !== null && searchEl.offsetWidth > 0 ? searchEl : rightEl;
    if (obstacle === null) return;
    const available =
      obstacle.getBoundingClientRect().left - crumbEl.getBoundingClientRect().left - GAP_PX;

    // Per-segment widths from the always-full hidden copy (color doesn't affect
    // width, so the copy renders uniformly). pr-2 spacing is baked into each
    // unit, so widths sum directly.
    const widths = [...measureEl.querySelectorAll<HTMLElement>("[data-seg]")].map(
      (u) => u.offsetWidth,
    );
    const ellipsisWidth = measureEl.querySelector<HTMLElement>("[data-ellipsis]")?.offsetWidth ?? 0;

    const total = widths.reduce((sum, w) => sum + w, 0);
    if (total <= available) {
      hiddenCount = 0;
      truncateLeaf = false;
      return;
    }

    // Keep trailing segments greedily, reserving room for the leading "…".
    const budget = available - ellipsisWidth;
    let used = 0;
    let kept = 0;
    for (let i = widths.length - 1; i >= 0; i -= 1) {
      if (used + widths[i] <= budget) {
        used += widths[i];
        kept += 1;
      } else break;
    }
    if (kept === 0) {
      // Not even the leaf fits: show "… / leaf" and truncate the leaf's text.
      hiddenCount = widths.length - 1;
      truncateLeaf = true;
      leafMaxPx = Math.max(48, Math.floor(budget));
    } else {
      hiddenCount = widths.length - kept;
      truncateLeaf = false;
    }
  }

  // Re-measure whenever the path changes (navigation), after the DOM paints.
  $effect(() => {
    void kindSegments;
    requestAnimationFrame(remeasure);
  });

  onMount(() => {
    const observer = new ResizeObserver(() => requestAnimationFrame(remeasure));
    if (navEl !== null) observer.observe(navEl);
    requestAnimationFrame(remeasure);
    return () => {
      observer.disconnect();
    };
  });
</script>

{#snippet crumbUnit(seg: string, href: string, isLeaf: boolean, truncate: boolean, asLink: boolean)}
  <span data-seg class="inline-flex shrink-0 items-baseline gap-1.5 pr-2 font-mono text-xs">
    <span class="text-foreground/25">/</span>
    {#if asLink}
      <a
        href={localizeHref(href)}
        class="hover:text-primary transition-colors {truncate
          ? 'text-foreground truncate'
          : isLeaf
            ? 'text-foreground'
            : 'text-muted-foreground'}"
        style={truncate ? `max-width: ${String(leafMaxPx)}px` : ""}>{seg}</a
      >
    {:else}
      <span
        class={truncate
          ? "text-foreground truncate"
          : isLeaf
            ? "text-foreground"
            : "text-muted-foreground"}
        style={truncate ? `max-width: ${String(leafMaxPx)}px` : ""}>{seg}</span
      >
    {/if}
  </span>
{/snippet}

{#snippet ellipsisUnit()}
  <span data-ellipsis class="inline-flex shrink-0 items-baseline gap-1.5 pr-2 font-mono text-xs">
    <span class="text-foreground/25">/</span>
    <span class="text-muted-foreground">…</span>
  </span>
{/snippet}

<header
  id="top"
  class="border-foreground/10 fixed top-0 right-0 left-0 z-40 border-b transition-[background-color,backdrop-filter] duration-200 {atBottom
    ? 'bg-background'
    : 'bg-background/85 backdrop-blur-md'}"
>
  <nav
    bind:this={navEl}
    class="relative flex items-center justify-between gap-4 px-4 py-2.5 sm:px-6"
  >
    <!-- Left: docolin logo + collapsing kind-path breadcrumb. -->
    <div class="flex min-w-0 items-baseline gap-2">
      <a
        href={localizeHref("/")}
        class="text-foreground shrink-0 font-semibold tracking-tight whitespace-nowrap"
      >
        docolin
      </a>

      <span bind:this={crumbEl} class="flex min-w-0 items-baseline overflow-hidden">
        {#if hiddenCount === 0}
          {#each crumbs as crumb, i (i)}
            <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
            {@render crumbUnit(crumb.slug, crumb.href, i === crumbs.length - 1, false, true)}
          {/each}
        {:else}
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
          {@render ellipsisUnit()}
          {#each visibleCrumbs as crumb, i (i)}
            <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
            {@render crumbUnit(
              crumb.slug,
              crumb.href,
              i === visibleCrumbs.length - 1,
              truncateLeaf && i === visibleCrumbs.length - 1,
              true,
            )}
          {/each}
        {/if}
      </span>
    </div>

    <!-- Center: search + language cluster, absolute-centered on the viewport
         independent of the side slots. -->
    <div class="pointer-events-none absolute inset-x-0 hidden items-center justify-center md:flex">
      <div bind:this={searchEl} class="pointer-events-auto flex w-full max-w-md items-center gap-2">
        <button
          type="button"
          class="border-input text-muted-foreground hover:border-foreground/30 inline-flex h-9 flex-1 cursor-pointer items-center gap-2 border bg-transparent px-3 text-sm transition-colors"
          aria-label={m.home_hero_search_label()}
          onclick={() => (commandPalette.open = true)}
        >
          <Search class="size-4 shrink-0" />
          <span class="truncate">{m.home_hero_search_placeholder()}</span>
          <Kbd.Group class="ml-auto">
            <Kbd.Root>{isMac ? "⌘" : "Ctrl"}</Kbd.Root>
            <Kbd.Root>K</Kbd.Root>
          </Kbd.Group>
        </button>
        <LanguageSwitcher />
      </div>
    </div>

    <!-- Right: auth slot. -->
    <div bind:this={rightEl} class="flex shrink-0 items-center gap-1.5">
      <div class="flex min-h-9 min-w-48 items-center justify-end gap-1.5">
        <InboxBell />
        <AccountMenu />
      </div>
      <ThemeToggle />
    </div>

    <!-- Hidden full-width copy, measured to decide how much to collapse. -->
    <span
      bind:this={measureEl}
      aria-hidden="true"
      class="pointer-events-none invisible absolute top-0 left-0 flex items-baseline"
    >
      {#each kindSegments as seg, i (i)}
        <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
        {@render crumbUnit(seg, "", false, false, false)}
      {/each}
      <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
      {@render ellipsisUnit()}
    </span>
  </nav>
</header>
