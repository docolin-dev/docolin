<script lang="ts">
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import Plus from "@lucide/svelte/icons/plus";
  import Search from "@lucide/svelte/icons/search";
  import Pin from "@lucide/svelte/icons/pin";
  import MessageSquareCheck from "@lucide/svelte/icons/message-square-check";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import StatusBadge from "$lib/components/discussions/StatusBadge.svelte";
  import { session } from "$lib/client/session.svelte";
  import { relativeTime } from "$lib/relative-time";
  import { discussionRef } from "$lib/doco-urls";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const docoHref = $derived(
    localizeHref(`/${data.org.slug}/${data.project.slug}/${data.docoPath}`),
  );
  const discussionsBase = $derived(
    `/${data.org.slug}/${data.project.slug}/${data.docoPath}/discussions`,
  );
  const newHref = $derived(localizeHref(`${discussionsBase}/new`));
  // Anonymous readers go straight to sign-in (returning to the create page),
  // rather than landing on a form they can't submit.
  const signinHref = $derived(
    localizeHref(`/signin?returnTo=${encodeURIComponent(`${discussionsBase}/new`)}`),
  );

  // Status filter is server-driven (re-runs load) so each filtered view is its
  // own cacheable URL. The search box filters the loaded set client-side, no
  // round-trip, the same way the inbox list filters.
  const filters = [
    { key: "open", label: m.discussion_list_filter_open() },
    { key: "closed", label: m.discussion_list_filter_closed() },
    { key: "all", label: m.discussion_list_filter_all() },
  ] as const;
  function filterHref(key: string): string {
    return localizeHref(discussionsBase) + `?status=${key}`;
  }

  let query = $state("");
  const visibleThreads = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return data.threads;
    return data.threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.authorHandle.toLowerCase().includes(q) ||
        (t.authorDisplayName?.toLowerCase().includes(q) ?? false),
    );
  });

  // Filter-aware empty state: the "no discussions yet, start one" message only
  // fits the truly-empty (all) and open views; the closed view has no CTA.
  const emptyState = $derived.by(() => {
    if (data.status === "closed") {
      return {
        title: m.discussion_list_empty_closed_title(),
        body: m.discussion_list_empty_closed_body(),
        cta: false,
      };
    }
    if (data.status === "open") {
      return {
        title: m.discussion_list_empty_open_title(),
        body: m.discussion_list_empty_open_body(),
        cta: true,
      };
    }
    return {
      title: m.discussion_list_empty_title(),
      body: m.discussion_list_empty_body(),
      cta: true,
    };
  });
</script>

<svelte:head>
  <title>{m.discussion_list_meta_title()} · {data.docoTitle} · docolin</title>
</svelte:head>

<DocoViewerNavbar kindSegments={data.kindSegments} />

<!-- Session-aware create CTA: signed in goes to the create page, anonymous to
     sign-in, and a fixed-size placeholder reserves the slot while the session
     hydrates so the heading row never shifts. -->
{#snippet newDiscussionCta(extraClass: string)}
  {#if !session.loaded}
    <div class="h-10 w-44 shrink-0 {extraClass}" aria-hidden="true"></div>
  {:else if session.value.dbUser}
    <Button href={newHref} class="h-10 shrink-0 gap-1.5 px-4 {extraClass}">
      <Plus class="size-4" />
      {m.discussion_list_new_button()}
    </Button>
  {:else}
    <Button href={signinHref} class="h-10 shrink-0 px-4 {extraClass}">
      {m.discussion_compose_signin()}
    </Button>
  {/if}
{/snippet}

<div class="mx-auto max-w-4xl px-6 pt-24 pb-16">
  <a
    href={docoHref}
    class="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
  >
    <ArrowLeft class="size-4" />
    {m.discussion_list_back_to_doco()}
  </a>

  <!-- Heading + context (which doc) on the left, primary action on the right.
       Stacks on mobile: side by side, the min-w-0 column shrinks below the
       heading's single-word min-content, which then overflows under the CTA. -->
  <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
    <div class="min-w-0">
      <h1 class="text-foreground text-3xl font-semibold tracking-tight">
        {m.discussion_list_heading()}
      </h1>
      <p class="text-muted-foreground mt-1 truncate text-sm">{data.docoTitle}</p>
    </div>
    <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
    {@render newDiscussionCta("")}
  </div>

  <!-- Controls row: search (client filter) grows to fill the row; status
       filter sits at the right at its natural width. -->
  <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
    <div class="relative w-full sm:flex-1">
      <Search
        class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        bind:value={query}
        placeholder={m.discussion_search_placeholder()}
        aria-label={m.discussion_search_placeholder()}
        class="h-10 pl-9"
      />
    </div>
    <div class="flex shrink-0 items-center gap-1 text-sm">
      {#each filters as f (f.key)}
        <a
          href={filterHref(f.key)}
          class="inline-flex h-10 items-center border px-3 transition-colors {data.status === f.key
            ? 'border-primary/40 bg-primary/5 text-foreground'
            : 'text-muted-foreground hover:text-foreground border-transparent'}"
          aria-current={data.status === f.key ? "page" : undefined}
        >
          {f.label}
        </a>
      {/each}
    </div>
  </div>

  {#if data.threads.length === 0}
    <!-- Empty state: icon, title, body, primary action (CLAUDE.md 10.2). -->
    <div
      class="border-foreground/15 flex flex-col items-center gap-3 border px-6 py-16 text-center"
    >
      <MessagesSquare class="text-muted-foreground/50 size-8" />
      <p class="text-foreground text-base font-medium">{emptyState.title}</p>
      <p class="text-muted-foreground max-w-sm text-sm leading-relaxed">
        {emptyState.body}
      </p>
      {#if emptyState.cta}
        <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
        {@render newDiscussionCta("mt-1")}
      {/if}
    </div>
  {:else if visibleThreads.length === 0}
    <p class="text-muted-foreground border-foreground/15 border px-6 py-12 text-center text-sm">
      {m.discussion_search_empty()}
    </p>
  {:else}
    <ul class="border-foreground/15 divide-foreground/10 flex flex-col divide-y border">
      {#each visibleThreads as t (t.id)}
        <li>
          <a
            href={localizeHref(`${discussionsBase}/${discussionRef(t.number, t.title)}`)}
            class="hover:bg-muted/40 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 transition-colors"
          >
            <StatusBadge status={t.status} compact />
            <span class="flex min-w-0 flex-col">
              <span class="flex min-w-0 items-center gap-1.5">
                {#if t.isPinned}
                  <Pin class="text-muted-foreground size-3 shrink-0" />
                {/if}
                {#if t.isAnswered}
                  <MessageSquareCheck
                    class="size-3.5 shrink-0 text-emerald-600"
                    role="img"
                    aria-label={m.discussion_answered_label()}
                  />
                {/if}
                <span
                  class="truncate font-medium {t.status === 'open'
                    ? 'text-foreground'
                    : 'text-muted-foreground'}"
                >
                  {t.title}
                </span>
              </span>
              <span class="text-muted-foreground truncate text-xs">
                {m.discussion_meta_by()}
                {#if t.authorDeleted}
                  <span class="text-muted-foreground">{m.common_deleted_account()}</span>
                {:else}
                  {t.authorDisplayName ?? `@${t.authorHandle}`}
                {/if}
                <span class="text-muted-foreground/40">·</span>
                {relativeTime(t.lastActivityAt, getLocale())}
              </span>
            </span>
            <span class="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs">
              <MessagesSquare class="size-3.5" />
              {t.replyCount}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>
