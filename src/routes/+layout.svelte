<script lang="ts">
  import "./layout.css";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { baseLocale, deLocalizeUrl, localizeUrl, locales } from "$paraglide/runtime";
  import { SITE_URL } from "$lib/site";
  import { refreshSession } from "$lib/client/session.svelte";
  import { setupCodeCopy } from "$lib/markdown/copy-code";
  import { setupCodeLineSelect } from "$lib/markdown/code-lines";
  // ?url asks Vite for the asset's final hashed URL string. The latin range
  // covers EN + DE traffic (umlauts and ß live in U+0000-00FF); the ext and
  // cyrillic ranges fetch lazily on demand. Preloading only the latin file
  // keeps the critical-path payload minimal.
  import geistLatinUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

  let { children }: { children: Snippet } = $props();

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
    // Wire copy buttons and shareable line selection in any rendered code block
    // (doco, discussion, preview).
    const teardownCodeCopy = setupCodeCopy();
    const teardownCodeLines = setupCodeLineSelect();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      teardownCodeCopy();
      teardownCodeLines();
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
</script>

<svelte:head>
  <!-- High-priority font preload so the browser starts fetching Geist before
       any layout/paint work, eliminating the visible width shift when text
       falls back to the system font and then swaps. Combined with the
       `font-display: block` in layout.css the result is no FOUT. -->
  <link rel="preload" href={geistLatinUrl} as="font" type="font/woff2" crossorigin="anonymous" />

  <link rel="canonical" href={canonical} />
  {#each altLinks as link (link.loc)}
    <link rel="alternate" hreflang={link.loc} href={link.href} />
  {/each}
  <link rel="alternate" hreflang="x-default" href={xDefault} />
</svelte:head>

{@render children()}
