<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import Github from "$lib/components/icons/Github.svelte";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { SITE_REPO, SITE_REPO_OWNER, SITE_REPO_NAME } from "$lib/site";

  let scrollY = $state(0);
  let viewportHeight = $state(0);
  let documentHeight = $state(0);
  let stars = $state<number | null>(null);

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
      `background-color: oklch(1 0 0 / ${(0.6 + 0.25 * navProgress).toFixed(3)})`,
      `box-shadow: 0 4px 16px -8px rgb(0 0 0 / ${(0.16 * (1 - navProgress)).toFixed(3)})`,
    ].join("; "),
  );

  const hairlineStyle = $derived(
    `opacity: ${navProgress.toFixed(2)}; transform: scaleX(${pageProgress.toFixed(4)});`,
  );

  onMount(async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${SITE_REPO_OWNER}/${SITE_REPO_NAME}`);
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (
        data !== null &&
        typeof data === "object" &&
        "stargazers_count" in data &&
        typeof data.stargazers_count === "number"
      ) {
        stars = data.stargazers_count;
      }
    } catch {
      // GitHub API unreachable; star count just stays hidden.
    }
  });

  function formatStars(n: number): string {
    if (n < 1000) return n.toString();
    const k = Math.round((n / 1000) * 10) / 10;
    const rounded = k === Math.floor(k) ? Math.floor(k) : k;
    return `${rounded.toString()}k`;
  }
</script>

<header class="fixed top-0 right-0 left-0 z-50" style={headerStyle}>
  <div class="border-foreground/12 relative mx-auto w-full backdrop-blur-md" style={containerStyle}>
    <nav class="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-2.5 sm:px-6">
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
          href={localizeHref("/for-ai")}
          class="text-muted-foreground hover:text-foreground hover:bg-foreground/5 px-3 py-1.5 transition-colors"
        >
          {m.nav_for_ai()}
        </a>
      </div>

      <div class="flex items-center gap-1.5 justify-self-end">
        <div class="hidden sm:block">
          <LanguageSwitcher />
        </div>
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
          {#if stars !== null}
            <span class="text-sm leading-none tabular-nums">{formatStars(stars)}</span>
          {/if}
        </Button>
        {#if page.data.dbUser}
          {@const dbUser = page.data.dbUser}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="outline"
                  size="sm"
                  class="h-9 gap-1.5 transition-all duration-200"
                >
                  <span class="font-mono text-xs">@{dbUser.handle}</span>
                  <ChevronDown class="size-3.5" />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="min-w-56" preventScroll={false}>
              <DropdownMenu.Label class="flex flex-col gap-0.5 py-2">
                <span class="font-mono text-sm font-medium">@{dbUser.handle}</span>
                {#if page.data.auth?.email}
                  <span class="text-muted-foreground text-xs font-normal">
                    {page.data.auth.email}
                  </span>
                {/if}
              </DropdownMenu.Label>
              <DropdownMenu.Separator />
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href="/signout" {...props}>
                    {m.nav_sign_out()}
                  </a>
                {/snippet}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {:else if page.data.auth}
          <Button href={localizeHref("/onboarding")} size="sm" variant="outline" class="h-9">
            {m.nav_finish_setup()}
          </Button>
        {:else}
          <Button href={localizeHref("/signin")} size="sm" variant="outline" class="h-9">
            {m.nav_sign_in()}
          </Button>
        {/if}
      </div>
    </nav>

    <div
      class="bg-primary pointer-events-none absolute right-0 bottom-0 left-0 h-px origin-left"
      style={hairlineStyle}
      aria-hidden="true"
    ></div>
  </div>
</header>
