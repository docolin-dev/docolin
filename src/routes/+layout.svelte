<script lang="ts">
  import "./layout.css";
  import type { Snippet } from "svelte";
  import { ModeWatcher } from "mode-watcher";
  import { Toaster } from "$lib/components/ui/sonner";
  import SearchCommand from "$lib/components/SearchCommand.svelte";
  import LeaveGuard from "$lib/components/LeaveGuard.svelte";
  import { onMount } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { baseLocale, deLocalizeUrl, localizeUrl, locales } from "$paraglide/runtime";
  import { SITE_URL } from "$lib/site";
  import { refreshSession } from "$lib/client/session.svelte";
  import { browser } from "$app/environment";
  // ?url asks Vite for the asset's final hashed URL string. The latin range
  // covers EN + DE traffic (umlauts and ß live in U+0000-00FF); the ext and
  // cyrillic ranges fetch lazily on demand. Preloading only the latin file
  // keeps the critical-path payload minimal.
  import geistLatinUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

  let { children }: { children: Snippet } = $props();

  // Reapply the reader's stored content-tab choice after the initial load and
  // every client navigation. Switching itself is CSS, so this only restores the
  // remembered tab on freshly rendered pages.
  // Client markdown hydration is loaded lazily (its browser-only deps stay out of
  // the worker), so it can be null on the first navigation; onMount does the
  // initial render once the module resolves.
  let markdown: typeof import("$lib/markdown/hydrate") | null = null;

  afterNavigate(() => {
    markdown?.enhanceRenderedMarkdown();
  });

  // Session lives client-side so public HTML can be edge-cached without
  // baking a reader's identity into the response. Kick off the first fetch
  // on mount; refetch when the tab regains visibility so a signin / signout
  // in another tab propagates without a full reload.
  onMount(() => {
    void refreshSession();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") void refreshSession();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Wire every client-side markdown widget (copy buttons, line select, tabs,
    // Mermaid, charts, popovers). Loaded lazily and behind `browser` so Vite
    // drops the browser-only libraries from the SSR/worker build.
    let teardownMarkdown: (() => void) | undefined;
    if (browser) {
      void import("$lib/markdown/hydrate").then((mod) => {
        markdown = mod;
        teardownMarkdown = mod.setupMarkdownHydration();
        // afterNavigate for the first page may have run before this resolved.
        mod.enhanceRenderedMarkdown();
      });
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      teardownMarkdown?.();
    };
  });

  // Build localized canonical URLs for each locale of the current path so
  // search engines can index every language variant of every page.
  const altLinks = $derived.by(() => {
    const dePath = deLocalizeUrl(page.url).pathname;
    return locales.map((loc) => ({
      loc,
      href: localizeUrl(`${SITE_URL}${dePath}`, { locale: loc }).href,
    }));
  });

  const canonical = $derived(`${SITE_URL}${page.url.pathname}`);
  const xDefault = $derived(altLinks.find((l) => l.loc === baseLocale)?.href ?? SITE_URL);

  // The doco route sets its own <link rel="canonical"> pointing at the
  // unversioned URL (so a pinned @version view consolidates onto the living
  // doco). Suppress the layout's pathname-based canonical there so the page
  // never ships two conflicting canonical tags. Other routes are canonical at
  // their own pathname and rely on the layout tag.
  const routeSetsOwnCanonical = $derived(page.route.id === "/[org=org]/[project]/[...path]");

  // The social-card image, resolved centrally from the route so every page gets
  // one and there is a single og:image tag (a per-page tag plus a layout default
  // would emit two, and crawlers pick unpredictably). Data-driven routes point
  // at their generated card endpoint (which re-derives the card server-side and
  // is edge-cached); everything else gets the branded static default. To give a
  // specific page its own art, drop a PNG in `static/og/` and add a case here.
  // Encode each path segment while preserving `/` as the separator, so an
  // unusual route param can't break out of or malform the og URL.
  const encodeOgPath = (raw: string): string =>
    raw
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  const ogImagePath = $derived.by(() => {
    const id = page.route.id;
    const p = page.params;
    if (id === "/[org=org]/[project]/[...path]") {
      return `/og/doco/${encodeOgPath(`${p.org ?? ""}/${p.project ?? ""}/${p.path ?? ""}`)}`;
    }
    if (id === "/[root=kind]/[...rest]") {
      const root = p.root ?? "";
      const rest = p.rest ?? "";
      return `/og/kind/${encodeOgPath(rest !== "" ? `${root}/${rest}` : root)}`;
    }
    if (id === "/[org=org]") {
      return `/og/profile/${encodeURIComponent(p.org ?? "")}`;
    }
    return "/og/default.png";
  });
  const ogImage = $derived(`${SITE_URL}${ogImagePath}`);
</script>

<svelte:head>
  <!-- High-priority font preload so the browser starts fetching Geist before
       any layout/paint work, eliminating the visible width shift when text
       falls back to the system font and then swaps. Combined with the
       `font-display: block` in layout.css the result is no FOUT. -->
  <link rel="preload" href={geistLatinUrl} as="font" type="font/woff2" crossorigin="anonymous" />

  {#if !routeSetsOwnCanonical}
    <link rel="canonical" href={canonical} />
  {/if}
  {#each altLinks as link (link.loc)}
    <link rel="alternate" hreflang={link.loc} href={link.href} />
  {/each}
  <link rel="alternate" hreflang="x-default" href={xDefault} />

  <!-- Social card, site-wide. Individual pages still set their own og:title /
       og:description; the image is centralized here so there's exactly one. -->
  <meta property="og:image" content={ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>

<!-- Manages the light/dark/system preference: toggles `.dark` on <html>
     (persisted, follows the OS for "system"), with a no-flash inline script. The
     frontpage opts back out by wrapping itself in `.light` (see +page.svelte). -->
<ModeWatcher />
<Toaster />
<SearchCommand />
<LeaveGuard />

{@render children()}
