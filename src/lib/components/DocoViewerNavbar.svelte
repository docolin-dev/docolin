<script lang="ts">
  import { localizeHref } from "$paraglide/runtime";
  import { m } from "$paraglide/messages";
  import Search from "@lucide/svelte/icons/search";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import InboxBell from "$lib/components/InboxBell.svelte";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";

  // Public doco-page chrome. Mirrors the dashboard navbar's style and right-
  // side widget cluster so signed-in users have visual continuity between
  // reading docs and managing them. The left side carries the kind-path
  // breadcrumb instead of the URL breadcrumb, readers care about
  // categorical location ("you're in network/firewall stuff"), not source
  // location.
  //
  // Search bar in the middle is currently a disabled placeholder. Search
  // isn't wired up yet; pre-alpha "obvs comes later" handling. Rendered as
  // a disabled button (not an input) so its non-functional state is obvious
  // and not misleading.

  interface Props {
    kindSegments: string[];
    // When the page is scrolled to the very bottom, drop the backdrop blur
    // and go fully opaque: there's no scroll-past content to see through, so
    // the translucent treatment just adds visual noise for no information.
    atBottom?: boolean;
  }
  let { kindSegments, atBottom = false }: Props = $props();
</script>

<header
  id="top"
  class="border-foreground/10 fixed top-0 right-0 left-0 z-40 border-b transition-[background-color,backdrop-filter] duration-200 {atBottom
    ? 'bg-background'
    : 'bg-background/85 backdrop-blur-md'}"
>
  <nav class="relative flex items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
    <!-- Left: docolin logo + kind-path breadcrumb. Same baseline-alignment
         trick as DashboardNavbar: sans-serif logo, mono breadcrumb. -->
    <div class="flex min-w-0 shrink-0 items-baseline gap-2">
      <a
        href={localizeHref("/")}
        class="text-foreground shrink-0 font-semibold tracking-tight whitespace-nowrap"
      >
        docolin
      </a>

      <!-- Wide-screen: full kind chain visible. -->
      <div class="hidden min-w-0 items-baseline gap-2 sm:flex">
        {#each kindSegments as seg, i (`${String(i)}-${seg}`)}
          <span class="text-foreground/25 shrink-0 font-mono text-xs">/</span>
          {#if i === kindSegments.length - 1}
            <span class="text-foreground truncate font-mono text-xs">{seg}</span>
          {:else}
            <span class="text-muted-foreground truncate font-mono text-xs">{seg}</span>
          {/if}
        {/each}
      </div>

      <!-- Narrow-screen: collapse to "... / leaf" so a deep kind path doesn't
           overflow on mobile. -->
      <div class="flex min-w-0 items-baseline gap-2 sm:hidden">
        {#if kindSegments.length > 1}
          <span class="text-foreground/25 shrink-0 font-mono text-xs">/</span>
          <span class="text-muted-foreground shrink-0 font-mono text-xs">…</span>
        {/if}
        {#if kindSegments.length >= 1}
          <span class="text-foreground/25 shrink-0 font-mono text-xs">/</span>
          <span class="text-foreground truncate font-mono text-xs">
            {kindSegments[kindSegments.length - 1]}
          </span>
        {/if}
      </div>
    </div>

    <!-- Center: search + language as one "discovery" cluster. Absolute-
         positioned so the cluster sits at the navbar's horizontal center
         independent of the breadcrumb / auth slot widths. pointer-events:
         none on the outer wrapper + auto on the inner cluster so clicks
         meant for the breadcrumb or auth slot pass through the empty
         gutter. Search uses h-9 + border-input + bg-transparent so it
         baseline-matches the LanguageSwitcher's Select.Trigger; they read
         as one cohesive control bar. -->
    <div class="pointer-events-none absolute inset-x-0 hidden items-center justify-center md:flex">
      <div class="pointer-events-auto flex w-full max-w-md items-center gap-2">
        <button
          type="button"
          class="border-input inline-flex h-9 flex-1 cursor-not-allowed items-center gap-2 border bg-transparent px-3 text-sm"
          aria-label={m.home_hero_search_label()}
          disabled
        >
          <Search class="text-muted-foreground size-4" />
          <span class="text-muted-foreground">{m.home_hero_search_placeholder()}</span>
        </button>
        <LanguageSwitcher />
      </div>
    </div>

    <!-- Right: auth slot only. min-h-9 reserves the height of the eventual
         buttons even when the slot is empty during loading, so the navbar
         doesn't grow vertically when content lands. min-w-48 reserves the
         worst-case [bell + handle] width; anon's narrower "Sign in" right-
         aligns inside it so the right edge stays even. -->
    <div class="flex shrink-0 items-center gap-1.5">
      <div class="flex min-h-9 min-w-48 items-center justify-end gap-1.5">
        <InboxBell />
        <AccountMenu />
      </div>
      <ThemeToggle />
    </div>
  </nav>
</header>
