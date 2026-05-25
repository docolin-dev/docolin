<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref, getLocale } from "$paraglide/runtime";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import { kindLabel } from "$lib/kind-label";
  import type { PageProps } from "./$types";

  // The taxonomy's top-level kinds as a grouped card grid (technical roots lead,
  // general-knowledge roots follow). The root list is static; counts and
  // descriptions come from the hard-cached load. Each card links to that root's
  // kind browse page, which handles its own empty state for roots with no docos.

  let { data }: PageProps = $props();
  const locale = $derived(getLocale());

  // SSR structured data so crawlers see the directory listing (this is an
  // indexable landing page). Built from the static, reader-independent root list.
  const allRoots = $derived([...data.technical, ...data.general]);
  const jsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: m.browse_heading(),
    description: m.browse_meta_description(),
    url: page.url.href,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: allRoots.length,
      itemListElement: allRoots.map((card, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: new URL(`/${card.root}`, page.url.origin).href,
        name: kindLabel(card.root),
      })),
    },
  });
  /* eslint-disable no-useless-escape */
  const jsonLdHtml = $derived(
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>`,
  );
  /* eslint-enable no-useless-escape */
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

{#snippet group(title: string, cards: typeof data.technical)}
  <section class="mb-12">
    <h2
      class="text-foreground border-foreground/10 mb-5 border-b pb-3 text-sm font-semibold tracking-tight"
    >
      {title}
    </h2>
    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each cards as card (card.root)}
        <a
          href={localizeHref(`/${card.root}`)}
          class="group border-foreground/12 bg-card hover:border-foreground/25 hover:bg-accent flex flex-col border p-6 transition-colors"
        >
          <div class="flex items-start justify-between gap-3">
            <h3
              class="text-foreground group-hover:text-primary flex items-center gap-1.5 text-lg font-medium tracking-tight transition-colors"
            >
              {kindLabel(card.root)}
              <ChevronRight
                class="text-muted-foreground/60 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </h3>
            {#if card.count > 0}
              <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
                {card.count === 1
                  ? m.browse_count_one({ count: card.count })
                  : m.browse_count_other({ count: card.count })}
              </span>
            {/if}
          </div>
          {#if card.description}
            <p class="text-muted-foreground mt-2 line-clamp-2 text-sm leading-relaxed">
              {card.description}
            </p>
          {/if}
        </a>
      {/each}
    </div>
  </section>
{/snippet}

<main class="mx-auto w-full max-w-6xl px-6 pt-24 pb-16">
  <header class="mb-10">
    <h1 class="text-foreground text-3xl font-semibold tracking-tight">{m.browse_heading()}</h1>
    <p class="text-muted-foreground mt-2 max-w-prose text-base leading-relaxed">
      {m.browse_subtitle()}
    </p>
  </header>

  <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
  {@render group(m.browse_group_technical(), data.technical)}
  <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
  {@render group(m.browse_group_general(), data.general)}
</main>
