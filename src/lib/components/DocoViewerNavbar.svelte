<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { localizeHref } from "$paraglide/runtime";
  import { m } from "$paraglide/messages";
  import Search from "@lucide/svelte/icons/search";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import MobileNavMenu from "$lib/components/MobileNavMenu.svelte";
  import InboxBell from "$lib/components/InboxBell.svelte";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import * as Popover from "$lib/components/ui/popover";
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
    // The doco reader carries Search in its bottom bar on mobile, so it hides
    // this navbar's mobile search icon to avoid a duplicate. Other surfaces
    // (browse, kind, profile) keep it as their only touch search entry.
    hideMobileSearch?: boolean;
  }
  let { kindSegments, atBottom = false, hideMobileSearch = false }: Props = $props();

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
  // Below md the whole path is one chip showing the deepest segment; a "…/"
  // prefix tells the reader there are ancestors above it without measuring.
  const leafSegment = $derived(kindSegments[kindSegments.length - 1] ?? "");
  // Apple shows ⌘, everything else Ctrl. False on SSR, swaps after hydration.
  const isMac = $derived(isMacPlatform());

  // The wordmark is the commons "home": it points at /browse everywhere in the
  // reader (matching the kind-path crumbs beside it, which all resolve to browse
  // pages) rather than the marketing homepage. On /browse itself it steps up to
  // the marketing home instead of linking to the page you're already on.
  // page.route.id is locale-independent, so this holds under /de/ and friends.
  const logoHref = $derived(page.route.id === "/browse" ? "/" : "/browse");

  function remeasure(): void {
    if (crumbEl === null || measureEl === null) return;
    // The measured crumb is md-only; below md the path is a single chip that
    // truncates in CSS, so there is nothing to measure (and a display:none
    // element reports a zero rect, which would compute a bogus budget).
    if (crumbEl.offsetParent === null) return;
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
    // The crumb is font-mono. Measuring before the webfont swaps in reports
    // narrower segments, so the path "fits" and never collapses; it then clips
    // once the real font lands. Re-measure once the fonts settle.
    void document.fonts.ready.then(() => requestAnimationFrame(remeasure));
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

<!-- interactive: the visible "…" is a popover that lists the whole kind path as
     links, so collapsed leading segments stay reachable on a phone. The hidden
     measuring copy passes false (a plain glyph) so its width matches. -->
{#snippet ellipsisUnit(interactive: boolean)}
  <span data-ellipsis class="inline-flex shrink-0 items-baseline gap-1.5 pr-2 font-mono text-xs">
    <span class="text-foreground/25">/</span>
    {#if interactive}
      <Popover.Root>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="text-muted-foreground hover:text-foreground cursor-pointer p-0 transition-colors"
              aria-label={m.nav_show_full_path()}
            >
              …
            </button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content
          align="start"
          class="border-foreground/15 bg-background w-auto max-w-[calc(100vw-2rem)] min-w-40 overflow-hidden rounded-none border p-1 ring-0"
        >
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
          {@render pathList()}
        </Popover.Content>
      </Popover.Root>
    {:else}
      <span class="text-muted-foreground">…</span>
    {/if}
  </span>
{/snippet}

<!-- The full kind path as indented links, shared by the desktop "…" popover and
     the mobile path chip. Indentation is the hierarchy; the deepest segment (the
     doco's own kind) is emphasized. Rows are full touch targets. -->
{#snippet pathList()}
  <nav class="flex flex-col">
    {#each crumbs as crumb, i (crumb.href)}
      <a
        href={localizeHref(crumb.href)}
        style:padding-left="{String(8 + i * 12)}px"
        class="hover:bg-muted/50 flex min-h-11 items-center truncate pr-3 font-mono text-xs transition-colors {i ===
        crumbs.length - 1
          ? 'text-foreground'
          : 'text-muted-foreground'}"
      >
        /{crumb.slug}
      </a>
    {/each}
  </nav>
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
    <!-- Left: docolin logo + kind path. Below md the path is a single chip that
         truncates in CSS and opens the full path on tap (no measuring, so it can
         never fail to collapse); md+ keeps the measured, per-crumb breadcrumb. -->
    <!-- items-center below md (the path is a padded chip button); the desktop
         crumb still baseline-aligns with the wordmark. -->
    <div class="flex min-w-0 items-center gap-2 md:items-baseline">
      <a
        href={localizeHref(logoHref)}
        class="text-foreground shrink-0 font-semibold tracking-tight whitespace-nowrap"
      >
        docolin
      </a>

      {#if kindSegments.length > 0}
        <div class="flex min-w-0 md:hidden">
          <Popover.Root>
            <Popover.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  class="text-foreground hover:text-primary -mx-1 flex min-w-0 cursor-pointer items-center gap-1.5 px-1 py-2 font-mono text-xs transition-colors"
                  aria-label={m.nav_show_full_path()}
                >
                  <span class="text-foreground/25 shrink-0">/</span>
                  {#if kindSegments.length > 1}
                    <span class="text-muted-foreground shrink-0">…</span>
                    <span class="text-foreground/25 shrink-0">/</span>
                  {/if}
                  <!-- min-w-0: a flex item defaults to min-width:auto, which would
                       stop `truncate` from ever shrinking and push the navbar's
                       right cluster off-screen on a long leaf segment. -->
                  <span class="min-w-0 truncate">{leafSegment}</span>
                  <ChevronDown class="text-muted-foreground size-3 shrink-0" />
                </button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content
              align="start"
              class="border-foreground/15 bg-background w-auto max-w-[calc(100vw-2rem)] min-w-48 overflow-hidden rounded-none border p-1 ring-0"
            >
              <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
              {@render pathList()}
            </Popover.Content>
          </Popover.Root>
        </div>
      {/if}

      <span bind:this={crumbEl} class="hidden min-w-0 items-baseline overflow-hidden md:flex">
        {#if hiddenCount === 0}
          {#each crumbs as crumb, i (i)}
            <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
            {@render crumbUnit(crumb.slug, crumb.href, i === crumbs.length - 1, false, true)}
          {/each}
        {:else}
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
          {@render ellipsisUnit(true)}
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

    <!-- Right: auth slot. Mobile collapses to the single MobileNavMenu trigger
         (44px, fixed) so the kind path gets the width back; md+ keeps the
         standalone inbox/theme widgets and the AccountMenu dropdown. The search
         icon is the mobile counterpart to the center search box, hidden on the
         doco reader where the bottom bar already carries search. -->
    <div bind:this={rightEl} class="flex shrink-0 items-center gap-1.5">
      {#if !hideMobileSearch}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground inline-flex size-9 items-center justify-center transition-colors md:hidden"
          aria-label={m.nav_search()}
          onclick={() => (commandPalette.open = true)}
        >
          <Search class="size-4" />
        </button>
      {/if}
      <div class="flex min-h-9 min-w-11 items-center justify-end gap-1.5 md:min-w-48">
        <div class="hidden md:block">
          <InboxBell />
        </div>
        <div class="hidden md:block">
          <AccountMenu />
        </div>
        <MobileNavMenu />
      </div>
      <div class="hidden md:block">
        <ThemeToggle />
      </div>
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
      {@render ellipsisUnit(false)}
    </span>
  </nav>
</header>
