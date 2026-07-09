<script lang="ts">
  import type { Snippet } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import { m } from "$paraglide/messages";
  import * as Sheet from "$lib/components/ui/sheet";
  import FolderTree from "@lucide/svelte/icons/folder-tree";
  import List from "@lucide/svelte/icons/list";
  import Search from "@lucide/svelte/icons/search";
  import PawPrint from "@lucide/svelte/icons/paw-print";

  // Thumb-reachable bottom bar for the doco reader on narrow screens. The
  // desktop layout carries navigation in two side rails: the sitemap tree
  // (hidden below lg) and the on-this-page TOC + Pango rail (hidden below xl).
  // On a phone both rails vanish with no substitute, and the search trigger is
  // ⌘K-only (unusable by touch). This bar surfaces all three plus search as
  // bottom sheets, so the primary actions live under the thumb instead of in
  // the top corners.
  //
  // The whole bar is lg:hidden: a phone / portrait-tablet affordance. At lg and
  // up the sitemap sidebar returns and a bottom tab bar would feel out of place
  // on a pointer device. (Between lg and xl the on-this-page TOC and Pango rail
  // are still hidden; surfacing those on that band is a separate follow-up.)
  let {
    pangoScore,
    progress,
    showPango,
    hasSitemap,
    hasToc,
    onSearch,
    contents,
    onThisPage,
    pango,
  }: {
    /** Current Pango score for the always-visible chip; null when unrated. */
    pangoScore: number | null;
    /** Reading progress 0..1, drives the hairline across the bar's top edge. */
    progress: number;
    /** Whether to show the Pango chip + sheet (hidden in the dev playground). */
    showPango: boolean;
    /** Whether the doco has a sitemap tree to show under Contents. */
    hasSitemap: boolean;
    /** Whether the doco has headings to show under On this page. */
    hasToc: boolean;
    /** Opens the global ⌘K search palette. */
    onSearch: () => void;
    /** Sitemap tree body; receives a close callback so a tap closes the sheet
     *  (afterNavigate alone misses a tap on the current page's own entry). */
    contents: Snippet<[() => void]>;
    /** TOC list body; receives a close callback for its links. */
    onThisPage: Snippet<[() => void]>;
    /** Pango rail body; receives a close callback for its stamp action. */
    pango: Snippet<[() => void]>;
  } = $props();

  let contentsOpen = $state(false);
  let tocOpen = $state(false);
  let pangoOpen = $state(false);

  function closeAll(): void {
    contentsOpen = false;
    tocOpen = false;
    pangoOpen = false;
  }

  // A sitemap tap navigates to another doco (client-side), which keeps this
  // component mounted, so the sheet would otherwise stay open across the
  // transition. Close everything once navigation settles.
  afterNavigate(closeAll);
</script>

<!-- pb via env() keeps the bar clear of the home indicator on notched phones;
     no spacing token expresses the safe-area inset. -->
<nav
  aria-label={m.doco_mobilebar_nav()}
  class="border-foreground/10 bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
>
  <div class="bg-foreground/10 pointer-events-none absolute inset-x-0 top-0 h-0.5">
    <div
      class="bg-primary h-full origin-left"
      style:width="{Math.max(0, Math.min(1, progress)) * 100}%"
    ></div>
  </div>

  <!-- Fixed left-to-right order so button positions never move between docos
       (muscle memory): the glanceable Pango number on the left (rarely tapped,
       read at rest), then cross-doc Contents, in-doc On this page, and the
       Search utility on the reachable right. A slot with no content is disabled,
       never removed, so the four-up grid never reflows. -->
  <div class="mx-auto flex max-w-3xl items-stretch">
    <button
      type="button"
      onclick={() => (pangoOpen = true)}
      disabled={!showPango}
      class="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors {showPango
        ? 'text-muted-foreground hover:text-foreground cursor-pointer'
        : 'text-muted-foreground/40 cursor-default'}"
      aria-label={m.doco_pango_score_label()}
    >
      <span
        class="flex items-center gap-1 text-sm font-semibold tabular-nums {showPango
          ? 'text-foreground'
          : ''}"
      >
        <PawPrint class="size-4" />
        {showPango ? (pangoScore ?? "-") : "-"}
      </span>
      <span class="w-full truncate text-center text-[11px] leading-none">
        {m.doco_pango_score_label()}
      </span>
    </button>

    <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
    {@render barButton(
      FolderTree,
      m.doco_mobilebar_contents(),
      () => (contentsOpen = true),
      !hasSitemap,
    )}
    <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
    {@render barButton(List, m.doco_toc_heading(), () => (tocOpen = true), !hasToc)}
    <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
    {@render barButton(Search, m.doco_mobilebar_search(), onSearch, false)}
  </div>
</nav>

{#snippet barButton(Icon: typeof Search, label: string, onclick: () => void, disabled: boolean)}
  <button
    type="button"
    {onclick}
    {disabled}
    class="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors {disabled
      ? 'text-muted-foreground/40 cursor-default'
      : 'text-muted-foreground hover:text-foreground cursor-pointer'}"
    aria-label={label}
  >
    <Icon class="size-5" />
    <span class="w-full truncate text-center text-[11px] leading-none">{label}</span>
  </button>
{/snippet}

{#if hasSitemap}
  <Sheet.Root bind:open={contentsOpen}>
    <Sheet.Content
      side="bottom"
      class="max-h-[85dvh] overflow-y-auto rounded-none px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <Sheet.Header class="px-0">
        <Sheet.Title>{m.doco_mobilebar_contents()}</Sheet.Title>
      </Sheet.Header>
      {@render contents(closeAll)}
    </Sheet.Content>
  </Sheet.Root>
{/if}

{#if hasToc}
  <Sheet.Root bind:open={tocOpen}>
    <Sheet.Content
      side="bottom"
      class="max-h-[85dvh] overflow-y-auto rounded-none px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <Sheet.Header class="px-0">
        <Sheet.Title>{m.doco_toc_heading()}</Sheet.Title>
      </Sheet.Header>
      {@render onThisPage(closeAll)}
    </Sheet.Content>
  </Sheet.Root>
{/if}

{#if showPango}
  <Sheet.Root bind:open={pangoOpen}>
    <Sheet.Content
      side="bottom"
      class="max-h-[85dvh] overflow-y-auto rounded-none px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <Sheet.Header class="px-0">
        <Sheet.Title>{m.doco_pango_score_label()}</Sheet.Title>
      </Sheet.Header>
      {@render pango(closeAll)}
    </Sheet.Content>
  </Sheet.Root>
{/if}
