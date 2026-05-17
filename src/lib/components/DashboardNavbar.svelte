<script lang="ts">
  import { page } from "$app/state";
  import { localizeHref } from "$paraglide/runtime";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import InboxBell from "$lib/components/InboxBell.svelte";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";

  // Breadcrumb-style top bar for /dashboard/* routes. Different chrome from
  // the marketing navbar so the user knows they're in admin mode. Logo +
  // breadcrumb left, language + account right. No scroll morph, no center
  // nav links, no footer (this is an admin surface).
  //
  // Per the dashboard spec's design pass: segments are derived from the URL
  // path. The deepest segment renders as plain text (you're here); earlier
  // segments are links to climb the chain. Slugs render plain (no @ prefix)
  // for parity with public hard URLs.
  const segments = $derived(page.url.pathname.split("/").filter(Boolean));
</script>

<header
  class="border-foreground/10 bg-background/85 fixed top-0 right-0 left-0 z-40 border-b backdrop-blur-md"
>
  <nav class="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
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
      <a
        href={localizeHref("/")}
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
            <span class="text-foreground truncate font-mono text-xs">{seg}</span>
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
          <span class="text-foreground truncate font-mono text-xs">
            {segments[segments.length - 1]}
          </span>
        {/if}
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1.5">
      <div class="hidden sm:block">
        <LanguageSwitcher />
      </div>
      <InboxBell />
      <AccountMenu />
    </div>
  </nav>
</header>
