<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { getLocale } from "$paraglide/runtime";
  import { Input } from "$lib/components/ui/input";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Search from "@lucide/svelte/icons/search";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  // Locale-aware short date. Filed-at on each claim helps admins spot stale
  // entries; medium style is concise enough for the queue rows.
  const dateFormatter = $derived(new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }));

  function formatDate(iso: string): string {
    return dateFormatter.format(new Date(iso));
  }

  // Client-side filter input. At admin volume (low) a full-text DB search
  // isn't worth the round-trip; substring-match locally over the loaded set
  // covers reference id lookups + spotting a specific requester.
  let query = $state("");
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return data.claims;
    return data.claims.filter((c) => {
      const haystack = [
        c.uid,
        c.slug,
        c.requester.handle,
        c.requester.email ?? "",
        c.requester.displayName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  });
</script>

<svelte:head>
  <title>{m.admin_claims_meta_title()} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-5xl">
  <div class="mb-10">
    <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.22em] uppercase">
      {m.admin_claims_eyebrow()}
    </p>
    <h1 class="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
      {m.admin_claims_heading()}
    </h1>
  </div>

  {#if data.claims.length === 0}
    <div
      class="border-foreground/10 bg-muted/30 flex flex-col items-center border px-6 py-16 text-center sm:py-20"
    >
      <h2 class="text-foreground text-xl font-medium tracking-tight">
        {m.admin_claims_empty_title()}
      </h2>
      <p class="text-muted-foreground mt-3 text-sm">
        {m.admin_claims_empty_body()}
      </p>
    </div>
  {:else}
    <!-- Filter input: substring match against uid, slug, requester handle,
         email, displayName. Auto-focuses for keyboard-first admins. Wrapped
         div sits the search icon inside the input via padding-left. -->
    <div class="relative mb-6 max-w-md">
      <Search
        class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        bind:value={query}
        placeholder={m.admin_claims_search_placeholder()}
        aria-label={m.admin_claims_search_placeholder()}
        class="h-10 pl-9"
        autofocus
      />
    </div>

    {#if filtered.length === 0}
      <p class="text-muted-foreground text-sm">
        {m.admin_claims_search_no_match()}
      </p>
    {:else}
      <div class="flex flex-col gap-4">
        {#each filtered as claim (claim.uid)}
          <a
            href={localizeHref(`/dashboard/admin/claims/${claim.uid}`)}
            class="bg-background border-foreground/15 hover:border-primary group flex flex-col gap-3 border p-5 transition-colors sm:p-6"
          >
            <!-- Row 1: slug + requester inline on the left, uid right.
                 items-baseline so the bigger slug shares a baseline with the
                 smaller handle / email. Flex-wrap so a long email drops to a
                 new visual row on narrow screens instead of squeezing the
                 uid off the side. -->
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 class="text-foreground text-xl font-medium tracking-tight">
                  {claim.slug}
                </h3>
                <span class="text-foreground/80 text-sm">@{claim.requester.handle}</span>
                {#if claim.requester.email}
                  <span class="text-muted-foreground font-mono text-sm">
                    {claim.requester.email}
                  </span>
                {/if}
              </div>
              <span class="text-muted-foreground shrink-0 font-mono text-xs">{claim.uid}</span>
            </div>

            <!-- Row 2: details preview. line-clamp-2 caps at two lines with
                 ellipsis; the extra vertical room (vs single-line truncate)
                 goes here now that the requester is inlined above. -->
            {#if claim.details}
              <p class="text-foreground/70 line-clamp-2 text-sm leading-relaxed">
                {claim.details}
              </p>
            {/if}

            <!-- Row 3: filed date (left) + arrow (right) -->
            <div class="mt-1 flex items-center justify-between gap-3">
              <span class="text-muted-foreground text-xs">
                {m.admin_claims_card_filed({ date: formatDate(claim.createdAt) })}
              </span>
              <ArrowRight
                class="text-muted-foreground/50 group-hover:text-primary size-4 transition-all group-hover:translate-x-0.5"
              />
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</div>
