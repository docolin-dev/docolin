<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { ldJsonScript } from "$lib/ld-json";
  import { localizeHref, getLocale } from "$paraglide/runtime";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import Check from "@lucide/svelte/icons/check";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Info from "@lucide/svelte/icons/info";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import BrowseDocoRow from "$lib/components/browse/BrowseDocoRow.svelte";
  import { kindLabel } from "$lib/kind-label";
  import { relativeTime } from "$lib/relative-time";
  import { getInferredSetup } from "$lib/client/setup-profile";
  import type { ListedDoco } from "$lib/server/doco-rows";
  import type { PageProps } from "./$types";

  // Browse as the newspaper front page of the commons (design pass: ten
  // visitors, seven concepts, hero + ticker won). Eye order: H1 with a
  // skip-to-topics anchor for the visitor who knows where they're going; one
  // static ticker line proving the place is alive; the lead story (today's
  // top doco, with the WHY spelled out as a sentence); the rest of trending
  // in graduated density; Fresh and the serendipity pick as the right rail;
  // the taxonomy directory as the closing landmark. One cached payload for
  // everyone; only the serendipity slice is re-picked client-side from the
  // shipped pool (same row count, nothing shifts), with the privacy whisper
  // stating that the profile never leaves the device.

  let { data }: PageProps = $props();
  const locale = $derived(getLocale());
  const feed = $derived(data.feed);

  const hero = $derived(feed.trending.at(0) ?? null);
  // Graduated density: the lead carries the story, ranks 2-3 keep their
  // descriptions and reason chips, the tail is one scannable line each. The tail
  // is capped so the trending column's height stays close to the right rail
  // (Fresh + For your setup); the shared-row grid then aligns the bottoms without
  // stretching the shorter side's rows sparse.
  const trendingMedium = $derived(feed.trending.slice(1, 3));
  const trendingCompact = $derived(feed.trending.slice(3, 5));

  const heroKindPath = $derived(
    hero === null ? "" : hero.kind.split("/").map(kindLabel).join(" / "),
  );
  // The lead's "why": in an activity window it is the activity itself; in the
  // all-time fallback it is Pango's verdict (personified, per house style).
  const heroSentence = $derived.by(() => {
    if (hero === null) return "";
    if (feed.trendingWindow !== "all") {
      const parts: string[] = [];
      if (hero.windowStamps > 0) {
        parts.push(
          hero.windowStamps === 1
            ? m.browse_hero_stamps_one()
            : m.browse_hero_stamps_other({ count: hero.windowStamps }),
        );
      }
      if (hero.windowDiscussions > 0) {
        parts.push(
          hero.windowDiscussions === 1
            ? m.browse_hero_discussions_one()
            : m.browse_hero_discussions_other({ count: hero.windowDiscussions }),
        );
      }
      return parts.join(" · ");
    }
    if (hero.pangoScore === null) return "";
    return hero.stampCount === 1
      ? m.browse_hero_pango_one({ score: hero.pangoScore })
      : m.browse_hero_pango_other({ score: hero.pangoScore, count: hero.stampCount });
  });

  // Sized so the For your setup rail's natural height matches the trending
  // column: the shared-row alignment then lands the bottoms without stretching
  // these rows (the setup rail renders at the same compact height as Fresh).
  const LOOK_ROWS = 5;
  // Server-rendered default; onMount swaps in setup-matched picks (writable
  // derived so a navigation resets it to the new payload's slice).
  let lookDocos: ListedDoco[] = $derived(feed.pool.slice(0, LOOK_ROWS));
  let lookPersonal = $state(false);
  onMount(() => {
    const tags = getInferredSetup();
    if (tags.length === 0) return;
    const tagSet = new Set(tags);
    const matched = feed.pool.filter((d) => d.appliesTo.some((t) => tagSet.has(t)));
    // Only relabel to "for your setup" when the match is real; one hit padded
    // with three random docos would be a lie.
    if (matched.length >= 2) {
      const rest = feed.pool.filter((d) => !matched.includes(d));
      lookDocos = [...matched, ...rest].slice(0, LOOK_ROWS);
      lookPersonal = true;
    }
  });

  const trendingSubtitle = $derived(
    feed.trendingWindow === "week"
      ? m.browse_trending_window_week()
      : feed.trendingWindow === "month"
        ? m.browse_trending_window_month()
        : m.browse_trending_window_all(),
  );

  // SSR structured data so crawlers see the directory listing (this is an
  // indexable landing page). Built from the static, reader-independent root list.
  const jsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: m.browse_heading(),
    description: m.browse_meta_description(),
    url: page.url.href,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: data.roots.length,
      itemListElement: data.roots.map((card, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: new URL(`/${card.root}`, page.url.origin).href,
        name: kindLabel(card.root),
      })),
    },
  });
  const jsonLdHtml = $derived(ldJsonScript(jsonLd));
</script>

<svelte:head>
  <title>{m.browse_meta_title()}</title>
  <meta name="description" content={m.browse_meta_description()} />
  <meta property="og:title" content={m.browse_meta_title()} />
  <meta property="og:description" content={m.browse_meta_description()} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={page.url.href} />
  <meta property="og:locale" content={locale} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html jsonLdHtml}
</svelte:head>

<DocoViewerNavbar kindSegments={[]} />

<main class="mx-auto w-full max-w-6xl px-6 pt-24 pb-16">
  <header class="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div>
      <h1 class="text-foreground text-3xl font-semibold tracking-tight">{m.browse_heading()}</h1>
      <p class="text-muted-foreground mt-2 max-w-prose text-base leading-relaxed">
        {m.browse_subtitle()}
      </p>
    </div>
    <!-- The visitor who already knows their topic skips the feed entirely. -->
    <a
      href="#topics"
      class="text-primary inline-flex items-center gap-1 text-sm transition-colors hover:underline"
    >
      {m.browse_skip_topics()}
      <ArrowDown class="size-3.5" aria-hidden="true" />
    </a>
  </header>

  {#if feed.events.length > 0}
    <!-- Static life signs: the latest in-window events, anonymized by
         construction (no actor ever leaves the server). -->
    <p class="text-muted-foreground mb-10 flex flex-wrap gap-x-6 gap-y-1 text-xs">
      {#each feed.events as event (event.docoHref + event.at)}
        <a
          href={localizeHref(event.docoHref)}
          class="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          {#if event.type === "verified"}
            <Check class="text-primary size-3 shrink-0" aria-hidden="true" />
            {m.browse_event_verified({ title: event.docoTitle })}
          {:else}
            <MessagesSquare class="text-primary size-3 shrink-0" aria-hidden="true" />
            {m.browse_event_discussion({ title: event.docoTitle })}
          {/if}
          <span aria-hidden="true">·</span>
          {relativeTime(event.at, locale)}
        </a>
      {/each}
    </p>
  {/if}

  <!-- A 2x2 grid rather than two independent columns: each row's height is
       shared, and the boxes inside stretch to fill it, so the right rail's
       bottom edges always land exactly on the left column's. DOM order is
       the mobile narrative (hero, trending, fresh, pick); the lg: classes
       place cells into the rows. -->
  <div class="mb-16 grid gap-y-6 lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:gap-x-10 lg:gap-y-0">
    {#if hero !== null}
      <section class="flex flex-col lg:col-span-2 lg:col-start-1 lg:row-start-1">
        <h2 class="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
          {m.browse_trending_heading()}
        </h2>
        <p class="text-muted-foreground mt-1 mb-4 text-sm">{trendingSubtitle}</p>

        <!-- The lead story: today's face of the commons. flex-1 so the card's
             bottom edge defines (or meets) the shared row edge. -->
        <a
          href={localizeHref(hero.href)}
          class="group border-foreground/12 bg-card hover:border-foreground/25 hover:bg-accent block flex-1 border p-6 transition-colors"
        >
          <p class="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
            {heroKindPath}
          </p>
          <h3
            class="text-foreground group-hover:text-primary mt-3 text-2xl font-semibold tracking-tight text-balance transition-colors sm:text-3xl"
          >
            {hero.title}
          </h3>
          {#if hero.description}
            <p class="text-muted-foreground mt-2 line-clamp-2 max-w-prose leading-relaxed">
              {hero.description}
            </p>
          {/if}
          {#if heroSentence.length > 0}
            <p class="text-primary mt-4 text-sm font-medium">{heroSentence}</p>
          {/if}
          <p class="text-muted-foreground mt-2 text-xs">
            {hero.projectLabel}
            <span aria-hidden="true">·</span>
            {relativeTime(hero.publishedAt, locale)}
            {#if feed.trendingWindow !== "all" && hero.pangoScore !== null}
              <span aria-hidden="true">·</span>
              {m.profile_pango({ score: hero.pangoScore })}
            {/if}
          </p>
        </a>
      </section>
    {/if}

    {#if trendingMedium.length > 0 || trendingCompact.length > 0}
      <ul
        class="border-foreground/12 divide-foreground/12 flex flex-col divide-y border lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:mt-4"
      >
        {#each trendingMedium as doco (doco.docoId)}
          <li>
            <BrowseDocoRow
              {doco}
              activity={{ stamps: doco.windowStamps, discussions: doco.windowDiscussions }}
            />
          </li>
        {/each}
        {#each trendingCompact as doco (doco.docoId)}
          <li class="flex flex-1"><BrowseDocoRow {doco} compact /></li>
        {/each}
      </ul>
    {/if}

    {#if feed.fresh.length > 0}
      <section class="flex flex-col lg:col-start-3 lg:row-start-1">
        <h2 class="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
          {m.browse_fresh_heading()}
        </h2>
        <p class="text-muted-foreground mt-1 mb-4 text-sm">{m.browse_fresh_subtitle()}</p>
        <!-- flex-1 + flex-1 rows: the box stretches to the shared row edge and
             the rows distribute the extra height instead of leaving a void. -->
        <ul class="border-foreground/12 divide-foreground/12 flex flex-1 flex-col divide-y border">
          {#each feed.fresh as doco (doco.docoId)}
            <li class="flex flex-1"><BrowseDocoRow {doco} compact /></li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if lookDocos.length > 0}
      <section class="flex flex-col lg:col-start-3 lg:row-start-2 lg:mt-10">
        <h2
          class="text-foreground flex items-center gap-1.5 text-xl font-semibold tracking-tight sm:text-2xl"
        >
          {lookPersonal ? m.browse_look_heading_personal() : m.browse_look_heading()}
          {#if lookPersonal}
            <!-- The privacy whisper: the profile never leaves the device.
                 Inline in the heading, so the relabel can't shift anything. -->
            <Tooltip.Provider delayDuration={150}>
              <Tooltip.Root>
                <Tooltip.Trigger
                  class="text-muted-foreground/70 hover:text-foreground inline-flex transition-colors"
                  aria-label={m.browse_look_whisper()}
                >
                  <Info class="size-4 shrink-0" aria-hidden="true" />
                </Tooltip.Trigger>
                <Tooltip.Content side="top" class="max-w-64 text-center">
                  {m.browse_look_whisper()}
                </Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
          {/if}
        </h2>
        <p class="text-muted-foreground mt-1 mb-4 text-sm">
          {lookPersonal ? m.browse_look_subtitle_personal() : m.browse_look_subtitle()}
        </p>
        <ul class="border-foreground/12 divide-foreground/12 flex flex-1 flex-col divide-y border">
          {#each lookDocos as doco (doco.docoId)}
            <li class="flex flex-1"><BrowseDocoRow {doco} compact /></li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>

  <section id="topics" class="scroll-mt-24">
    <h2 class="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
      {m.browse_topics_heading()}
    </h2>
    <p class="text-muted-foreground mt-1 mb-4 text-sm">{m.browse_topics_subtitle()}</p>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.roots as card (card.root)}
        <a
          href={localizeHref(`/${card.root}`)}
          class="group border-foreground/12 bg-card hover:border-foreground/25 hover:bg-accent flex items-center justify-between gap-3 border px-4 py-3 transition-colors"
        >
          <span
            class="text-foreground group-hover:text-primary flex items-center gap-1.5 text-base font-medium tracking-tight transition-colors"
          >
            {kindLabel(card.root)}
            <ChevronRight
              class="text-muted-foreground/60 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            />
          </span>
          {#if card.count > 0}
            <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
              {card.count === 1
                ? m.browse_count_one({ count: card.count })
                : m.browse_count_other({ count: card.count })}
            </span>
          {/if}
        </a>
      {/each}
    </div>
  </section>
</main>
