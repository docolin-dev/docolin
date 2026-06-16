<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import Github from "$lib/components/icons/Github.svelte";
  import InboxBell from "$lib/components/InboxBell.svelte";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { SITE_REPO } from "$lib/site";

  let scrollY = $state(0);
  let viewportHeight = $state(0);
  let documentHeight = $state(0);

  $effect(() => {
    let rafScheduled = false;

    function readMetrics(): void {
      rafScheduled = false;
      scrollY = window.scrollY;
      viewportHeight = window.innerHeight;
      documentHeight = document.body.scrollHeight;
    }

    function onScroll(): void {
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(readMetrics);
      }
    }

    function onResize(): void {
      readMetrics();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    readMetrics();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  });

  // 0 → 1 across the first half-viewport of scroll. Drives the floating→sticky morph.
  const navProgress = $derived.by(() => {
    if (viewportHeight <= 0) return 0;
    return Math.min(1, Math.max(0, scrollY / (viewportHeight * 0.5)));
  });

  // 0 → 1 across the full page. Drives the bottom hairline.
  const pageProgress = $derived.by(() => {
    const max = documentHeight - viewportHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  });

  // Inline styles update every animation frame as scrollY changes. Pure
  // interpolation of pixel-precise CSS values; no class swap to fight.
  const headerStyle = $derived(
    `padding-top: ${(16 * (1 - navProgress)).toFixed(2)}px; padding-left: ${(16 * (1 - navProgress)).toFixed(2)}px; padding-right: ${(16 * (1 - navProgress)).toFixed(2)}px;`,
  );

  const containerStyle = $derived(
    [
      `max-width: ${Math.round(1024 + 3000 * navProgress).toString()}px`,
      `border-top-width: ${(1 - navProgress).toFixed(2)}px`,
      `border-left-width: ${(1 - navProgress).toFixed(2)}px`,
      `border-right-width: ${(1 - navProgress).toFixed(2)}px`,
      `border-bottom-width: 1px`,
      `background-color: color-mix(in oklch, var(--background) ${(60 + 25 * navProgress).toFixed(1)}%, transparent)`,
      `box-shadow: 0 4px 16px -8px rgb(0 0 0 / ${(0.16 * (1 - navProgress)).toFixed(3)})`,
    ].join("; "),
  );

  const hairlineStyle = $derived(
    `opacity: ${navProgress.toFixed(2)}; transform: scaleX(${pageProgress.toFixed(4)});`,
  );
</script>

<header class="fixed top-0 right-0 left-0 z-50" style={headerStyle}>
  <div class="border-foreground/12 relative mx-auto w-full backdrop-blur-md" style={containerStyle}>
    <nav
      class="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-2 sm:px-6 md:grid-cols-[1fr_auto_1fr]"
    >
      <a
        href={localizeHref("/")}
        class="flex items-center gap-2 justify-self-start text-base font-semibold tracking-tight whitespace-nowrap"
      >
        <span>docolin</span>
        <span class="text-muted-foreground/60 hidden text-xs font-normal tracking-wide sm:inline">
          pre-alpha
        </span>
      </a>

      <div class="hidden items-center gap-1 justify-self-center text-sm md:flex">
        <a
          href={localizeHref("/browse")}
          class="text-muted-foreground hover:text-foreground hover:bg-foreground/5 px-3 py-1.5 transition-colors"
        >
          {m.nav_browse()}
        </a>
        <a
          href={localizeHref("/for-projects")}
          class="text-muted-foreground hover:text-foreground hover:bg-foreground/5 px-3 py-1.5 transition-colors"
        >
          {m.nav_for_projects()}
        </a>
        <a
          href={localizeHref("/mcp")}
          class="text-muted-foreground hover:text-foreground hover:bg-foreground/5 px-3 py-1.5 transition-colors"
        >
          {m.nav_for_ai()}
        </a>
      </div>

      <div class="flex items-center gap-1.5 justify-self-end">
        <Button
          href={SITE_REPO}
          variant="ghost"
          size="sm"
          target="_blank"
          rel="noopener noreferrer"
          class="h-9 gap-2"
          aria-label={m.nav_github_aria()}
        >
          <Github class="size-4" />
        </Button>
        <ThemeToggle />
        <div class="hidden sm:block">
          <LanguageSwitcher />
        </div>
        <InboxBell />
        <AccountMenu />
      </div>
    </nav>

    <div
      class="bg-primary pointer-events-none absolute right-0 bottom-0 left-0 h-px origin-left"
      style={hairlineStyle}
      aria-hidden="true"
    ></div>
  </div>
</header>
