<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import Search from "@lucide/svelte/icons/search";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import MobileNavMenu from "$lib/components/MobileNavMenu.svelte";
  import InboxBell from "$lib/components/InboxBell.svelte";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { commandPalette } from "$lib/client/command-palette.svelte";
  import { isMacPlatform } from "$lib/client/platform";
  import * as Kbd from "$lib/components/ui/kbd";

  // Breadcrumb-style top bar for /dashboard/* routes. Different chrome from
  // the marketing navbar so the user knows they're in admin mode. Logo +
  // breadcrumb left, search in the middle, language + auth slot right.
  // Search mirrors the doco-viewer chrome so signed-in users see one search
  // surface across reading and managing.
  //
  // Per the dashboard spec's design pass: segments are derived from the URL
  // path. The deepest segment renders as plain text (you're here); earlier
  // segments are links to climb the chain. Slugs render plain (no @ prefix)
  // for parity with public hard URLs.
  const segments = $derived(page.url.pathname.split("/").filter(Boolean));
  // A route can supply a readable label for its deepest crumb (e.g. an inbox
  // message uuid renders as "Message"); falls back to the raw segment.
  const lastLabel = $derived(page.data.breadcrumb ?? segments[segments.length - 1]);
  // Apple shows ⌘, everything else Ctrl. False on SSR, swaps after hydration.
  const isMac = $derived(isMacPlatform());
</script>

<header
  class="border-foreground/10 bg-background/85 fixed top-0 right-0 left-0 z-40 border-b backdrop-blur-md"
>
  <nav class="relative flex items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
    <!-- Breadcrumb: wide screens show the full chain; narrow screens collapse
         intermediate segments to a "..." link back to the parent so the
         deepest segment stays visible without horizontal overflow.
         items-baseline on the breadcrumb cluster aligns the *character
         baselines* (bottom of the glyphs) across the sans logo + mono
         segments. Box-center alignment doesn't, because Geist sans and
         Geist Mono have different cap-height / x-height metrics. The
         parent nav row stays items-center so the whole breadcrumb block
         still centers against the right-side h-9 buttons. -->
    <div class="flex min-w-0 items-baseline gap-2">
      <!-- The wordmark goes to the commons (browse), not the marketing homepage:
           inside the app that's almost always where you actually want to land.
           The dashboard root stays reachable via the "dashboard" crumb. -->
      <a
        href={localizeHref("/browse")}
        class="text-foreground shrink-0 font-semibold tracking-tight whitespace-nowrap"
      >
        docolin
      </a>

      <!-- Wide-screen breadcrumb: full chain visible -->
      <div class="hidden min-w-0 items-baseline gap-2 sm:flex">
        {#each segments as seg, i (`${i.toString()}-${seg}`)}
          {@const path = "/" + segments.slice(0, i + 1).join("/")}
          {@const isLast = i === segments.length - 1}
          <span class="text-foreground/25 shrink-0 font-mono text-xs">/</span>
          {#if isLast}
            <span class="text-foreground min-w-0 truncate font-mono text-xs">{lastLabel}</span>
          {:else}
            <a
              href={path}
              class="text-muted-foreground hover:text-foreground truncate font-mono text-xs transition-colors"
            >
              {seg}
            </a>
          {/if}
        {/each}
      </div>

      <!-- Narrow-screen breadcrumb: collapse to "... / deepest" so mobile
           never horizontal-scrolls a deep path. -->
      <div class="flex min-w-0 items-baseline gap-2 sm:hidden">
        {#if segments.length > 1}
          {@const parent = "/" + segments.slice(0, -1).join("/")}
          <span class="text-foreground/25 shrink-0 font-mono text-xs">/</span>
          <a
            href={parent}
            class="text-muted-foreground hover:text-foreground shrink-0 font-mono text-xs transition-colors"
          >
            …
          </a>
        {/if}
        {#if segments.length >= 1}
          <span class="text-foreground/25 shrink-0 font-mono text-xs">/</span>
          <span class="text-foreground min-w-0 truncate font-mono text-xs">
            {lastLabel}
          </span>
        {/if}
      </div>
    </div>

    <!-- Center: search + language as one "discovery" cluster. Mirrors the
         doco-viewer chrome (see DocoViewerNavbar) so signed-in users see
         the same controls in the same place across reading and managing.
         pointer-events handling lets clicks pass through the empty gutter
         to the breadcrumb / auth slot. -->
    <div class="pointer-events-none absolute inset-x-0 hidden items-center justify-center md:flex">
      <div class="pointer-events-auto flex w-full max-w-md items-center gap-2">
        <!-- h-9 + border-input + bg-transparent match the LanguageSwitcher's
             Select.Trigger so the two read as one cohesive control bar. -->
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

    <!-- Right: auth slot only. min-h-9 reserves the height of the eventual
         buttons even when the slot is empty during loading, so the navbar
         doesn't grow vertically when content lands. min-w-48 reserves the
         worst-case [bell + handle] width; anon's narrower "Sign in" right-
         aligns inside it so the right edge stays even. -->
    <div class="flex shrink-0 items-center gap-1.5">
      <!-- Mobile counterpart to the center search box (hidden below md). -->
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground inline-flex size-9 items-center justify-center transition-colors md:hidden"
        aria-label={m.nav_search()}
        onclick={() => (commandPalette.open = true)}
      >
        <Search class="size-4" />
      </button>
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
  </nav>
</header>
