<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Flag from "@lucide/svelte/icons/flag";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ReportDialog from "$lib/components/moderation/ReportDialog.svelte";
  import RequestDeletionDialog from "$lib/components/moderation/RequestDeletionDialog.svelte";
  import PangoScoreRail from "$lib/components/doco/PangoScoreRail.svelte";
  import StampPrompt from "$lib/components/doco/StampPrompt.svelte";
  import { githubEditUrl } from "$lib/git/github-url";
  import { session } from "$lib/client/session.svelte";
  import type { ModerationTargetType } from "$lib/moderation-reasons";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const doco = $derived(data.doco);

  // Discussions live under the doco URL as a sub-route (per-doco thread list).
  const discussionsHref = $derived(
    localizeHref(`/${data.org.slug}/${data.project.slug}/${doco.pathFromProjectRoot}/discussions`),
  );

  // Moderation actions menu (signed-in only). Reporting is open to any signed-in
  // user; "request deletion" of this version is moderator-only, gated by a
  // per-doco capabilities fetch (the viewer HTML is cached and reader-agnostic).
  const signedIn = $derived(session.value.dbUser !== null);
  let canModerate = $state(false);
  let capsForDocoId = "";
  $effect(() => {
    const id = doco.id;
    // The dev playground has no DB row behind it; never hit a doco-id-keyed endpoint.
    if (data.playground) return;
    if (!session.loaded || session.value.dbUser === null || capsForDocoId === id) return;
    capsForDocoId = id;
    canModerate = false;
    void (async () => {
      const res = await fetch(`/api/docos/${id}/capabilities`, { credentials: "same-origin" });
      if (res.ok && doco.id === id) {
        const caps = (await res.json()) as { canModerate: boolean };
        canModerate = caps.canModerate;
      }
    })();
  });

  // Pango Score freshness. The doco HTML is long-cached, so the score baked into
  // it can be up to a day stale. Paint that value instantly, then refetch the
  // live score after hydration and update it in place. Cache-first: mutable
  // public data hydrates client-side, so a stamp/recompute never needs a page
  // purge. Re-runs on version change so navigation refreshes it.
  let liveScore = $state<number | null>(null);
  let liveCount = $state(0);
  let liveConfirmed = $state<string | null>(null);
  $effect(() => {
    liveScore = doco.pangoScore;
    liveCount = doco.verifiedCount;
    liveConfirmed = doco.lastConfirmedAt;
    if (data.playground) return;
    const versionId = doco.versionId;
    void (async () => {
      const res = await fetch(`/api/versions/${versionId}/pango-score`, {
        credentials: "same-origin",
      });
      if (!res.ok || doco.versionId !== versionId) return;
      const fresh = (await res.json()) as {
        score: number | null;
        verifiedCount: number;
        lastConfirmedAt: string | null;
      };
      liveScore = fresh.score;
      liveCount = fresh.verifiedCount;
      liveConfirmed = fresh.lastConfirmedAt;
    })();
  });

  // Moderation dialogs target the displayed version. Report is open to any
  // signed-in reader; request-deletion is gated by canModerate above.
  interface ModTarget {
    type: ModerationTargetType;
    id: string;
  }
  let reportTarget = $state<ModTarget | null>(null);
  let reportOpen = $state(false);
  let requestDeletionTarget = $state<ModTarget | null>(null);
  let requestDeletionOpen = $state(false);
  function openReport(): void {
    reportTarget = { type: "version", id: doco.versionId };
    reportOpen = true;
  }
  function openRequestDeletion(): void {
    requestDeletionTarget = { type: "version", id: doco.versionId };
    requestDeletionOpen = true;
  }
  // "Edit on GitHub" only exists for git-backed projects; native projects
  // (when shipped) have no source URL to send the user to. The viewer's
  // server load is currently git-only so gitSource.repoUrl is always
  // populated; pathInSource is nullable per the docos schema (soft-deleted
  // docos clear it), so guard against that.
  const editHref = $derived(
    data.pathInSource !== null
      ? githubEditUrl(data.gitSource.repoUrl, data.gitSource.defaultBranch, data.pathInSource)
      : null,
  );

  // Sitemap is stored as unknown jsonb; narrow defensively for rendering.
  interface SitemapNode {
    title: string;
    url?: string;
    children?: SitemapNode[];
  }
  function asSitemapNodes(raw: unknown): SitemapNode[] {
    if (!Array.isArray(raw)) return [];
    const out: SitemapNode[] = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const entry = item as Record<string, unknown>;
      if (typeof entry.title !== "string") continue;
      const node: SitemapNode = { title: entry.title };
      if (typeof entry.url === "string") node.url = entry.url;
      if (Array.isArray(entry.children)) node.children = asSitemapNodes(entry.children);
      out.push(node);
    }
    return out;
  }
  const sitemap = $derived(asSitemapNodes(doco.sitemap));

  // Sitemap "you are here" marker. Compared against the unlocalized form of
  // node.url; sitemap entries come from source authoring, not a localized
  // form, so a plain string match is the right comparison here.
  const currentPageUrl = $derived(
    `/${data.org.slug}/${data.project.slug}/${doco.pathFromProjectRoot}`,
  );

  const dateFormatter = $derived(new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }));
  const relativeFormatter = $derived(
    new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto", style: "long" }),
  );
  function relativeTime(iso: string): string {
    const target = new Date(iso).getTime();
    const now = Date.now();
    const seconds = Math.round((target - now) / 1000);
    const abs = Math.abs(seconds);
    if (abs < 60) return relativeFormatter.format(seconds, "second");
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relativeFormatter.format(hours, "hour");
    const days = Math.round(hours / 24);
    return relativeFormatter.format(days, "day");
  }

  // Kind path split into segments for the navbar breadcrumb. Last segment is
  // the current doco (rendered distinctively, non-link); earlier segments
  // are non-clickable text for now (category index pages don't exist yet).
  const kindSegments = $derived(doco.kind.split("/"));

  // English-ish list separator between author names: comma between non-final
  // pairs, "&" before the final name. 2 → "Alice & Bob"; 3 → "A, B & C".
  function authorSeparator(index: number, total: number): string {
    if (index === 0) return "";
    if (index === total - 1) return " & ";
    return ", ";
  }

  function formatTimeEstimate(min: number | null, max: number | null): string | null {
    if (min === null) return null;
    if (max === null || max === min) return formatMinutes(min);
    return `${formatMinutes(min)} - ${formatMinutes(max)}`;
  }
  function formatMinutes(total: number): string {
    if (total < 60) return `${String(total)}m`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m === 0 ? `${String(h)}h` : `${String(h)}h ${String(m)}m`;
  }
  const timeEstimate = $derived(
    formatTimeEstimate(doco.timeEstimateMinMinutes, doco.timeEstimateMaxMinutes),
  );

  // Scroll-spy: highlight the TOC entry whose heading is currently nearest
  // the top of the viewport. Wired as $effect keyed on doco.id so the
  // observer rewires when SvelteKit navigates between [...path] docos
  // without unmounting this component.
  let activeId = $state<string | null>(null);
  // Non-reactive: tracking whether this is the first run of the spy effect
  // so we only pin during *real* navigations, not the initial mount.
  let firstSpyRun = true;
  $effect(() => {
    // Re-run when EITHER the loaded doco OR its version changes. doco.id stays
    // constant across versions of the same doco (it's the doco identity), so
    // tracking only id misses dropdown-driven version switches; the body's
    // heading nodes get replaced but the observer keeps watching the dead ones.
    // Touching versionNumber re-fires the effect on every version transition.
    void doco.id;
    void doco.versionNumber;
    if (!firstSpyRun) {
      // SvelteKit auto-scrolls to top on navigation; pin to no-section so
      // the scroll-through IO fires don't flap H3 lists open en route.
      pinUntilScrollEnd(-1);
    }
    firstSpyRun = false;
    const headings = document.querySelectorAll<HTMLElement>("article h2[id], article h3[id]");
    if (headings.length === 0) {
      activeId = null;
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeId = entry.target.id;
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    for (const h of headings) observer.observe(h);
    activeId = headings[0].id;
    return () => {
      observer.disconnect();
    };
  });

  // Group the flat TOC into H2 sections with their H3 children. Each H3 is
  // attached to the most recent H2; H3s before any H2 are dropped (rare).
  interface TocSection {
    h2: (typeof doco.toc)[number];
    h3s: (typeof doco.toc)[number][];
  }
  const tocTree = $derived.by((): TocSection[] => {
    const sections: TocSection[] = [];
    for (const entry of doco.toc) {
      if (entry.level === 2) {
        sections.push({ h2: entry, h3s: [] });
      } else if (entry.level === 3 && sections.length > 0) {
        sections[sections.length - 1].h3s.push(entry);
      }
    }
    return sections;
  });

  // Which section contains the active heading. Drives the highlight; the
  // text styling reacts immediately so scroll-spy feels responsive.
  const activeSectionIndex = $derived.by(() => {
    if (activeId === null) return -1;
    for (let i = 0; i < tocTree.length; i++) {
      const section = tocTree[i];
      if (section.h2.id === activeId) return i;
      for (const h3 of section.h3s) {
        if (h3.id === activeId) return i;
      }
    }
    return -1;
  });

  // When the reader clicks a TOC link, the browser smooth-scrolls through
  // every section in between. Without intervention IO would briefly fire
  // for each one and the H3 lists would flap open and shut along the way.
  // Pin the expansion to the click's destination for the duration of that
  // scroll; release on `scrollend` (with a timeout fallback for browsers
  // that haven't shipped it yet).
  let pinnedSectionIndex = $state<number | null>(null);
  const expandedSectionIndex = $derived(pinnedSectionIndex ?? activeSectionIndex);

  function findSectionForId(id: string): number {
    for (let i = 0; i < tocTree.length; i++) {
      const section = tocTree[i];
      if (section.h2.id === id) return i;
      for (const h3 of section.h3s) {
        if (h3.id === id) return i;
      }
    }
    return -1;
  }

  function pinUntilScrollEnd(sectionIdx: number): void {
    pinnedSectionIndex = sectionIdx;

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      pinnedSectionIndex = null;
      window.removeEventListener("scrollend", release);
    };
    window.addEventListener("scrollend", release, { once: true });
    // Fallback for Safari < 18 etc. 1.5s comfortably covers a full-page
    // smooth scroll.
    setTimeout(release, 1500);
  }

  function pinSectionForId(targetId: string): void {
    const sectionIdx = findSectionForId(targetId);
    if (sectionIdx === -1) return;
    pinUntilScrollEnd(sectionIdx);
  }

  // Scroll-position bar: a continuous proportional mapping. The segment's
  // top/bottom on the TOC bar correspond to the top/bottom of the viewport's
  // doc range, mapped through each heading's doc-y range to its TOC-y range.
  //
  // So as you scroll through a section, the segment slides smoothly within
  // that section's TOC row (showing how far through the section you are),
  // not snapping discretely. Crossing section boundaries advances into the
  // next TOC row's range. Reads like a true minimap.
  let tocBarEl = $state<HTMLDivElement | null>(null);
  let scrollY = $state(0);
  let viewportHeight = $state(0);
  let docHeight = $state(0);
  // Ticked when TOC layout shifts (sections expand/collapse) or window
  // resizes, so the heading map rebuilds with fresh offsetTops.
  let tocLayoutVersion = $state(0);

  // Doc-order list of heading IDs currently rendered in the TOC. H3s only
  // appear when their parent H2 section is active; collapsed sections only
  // expose their H2. Scrolling through a collapsed section's H3 content then
  // maps proportionally into the H2's single TOC row.
  const tocOrderIds = $derived.by((): string[] => {
    const ids: string[] = [];
    for (let i = 0; i < tocTree.length; i++) {
      const section = tocTree[i];
      ids.push(section.h2.id);
      // Keep this aligned with the rendered TOC (debounced expansion);
      // otherwise the headingMap looks up TOC links that aren't in the DOM
      // and the indicator misaligns.
      if (i === expandedSectionIndex) {
        for (const h3 of section.h3s) ids.push(h3.id);
      }
    }
    return ids;
  });

  onMount(() => {
    scrollY = window.scrollY;
    viewportHeight = window.innerHeight;
    docHeight = document.documentElement.scrollHeight;
    const onScroll = (): void => {
      scrollY = window.scrollY;
      docHeight = document.documentElement.scrollHeight;
    };
    const onResize = (): void => {
      scrollY = window.scrollY;
      viewportHeight = window.innerHeight;
      docHeight = document.documentElement.scrollHeight;
      // Article may have re-flowed: heading positions change.
      tocLayoutVersion += 1;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  });

  // Navbar floats translucent over scrolled content; at the very bottom of
  // the doc the blur becomes pointless (and visually distracting), so we
  // switch it to a solid background. 8px tolerance covers sub-pixel rounding.
  const atBottom = $derived(scrollY + viewportHeight >= docHeight - 8);

  // Re-measure when TOC layout shifts (sections expand/collapse).
  $effect(() => {
    const el = tocBarEl;
    if (el === null) return;
    const observer = new ResizeObserver(() => {
      tocLayoutVersion += 1;
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  });

  // Approximate fixed-navbar height so viewport-top maps to the y where
  // article content actually becomes visible (not the occluded part behind
  // the navbar). Tuned visually; doesn't need to be pixel-perfect.
  const NAV_OFFSET_PX = 56;

  interface MapEntry {
    docTop: number;
    docBottom: number;
    tocTop: number;
    tocBottom: number;
  }

  // Map each currently-rendered TOC row to its corresponding article doc-y
  // range. H3s that aren't rendered (collapsed sections) get absorbed into
  // their parent H2's doc range, so scrolling through them moves the segment
  // through the H2's single TOC row.
  const headingMap = $derived.by((): MapEntry[] => {
    void tocLayoutVersion;
    const el = tocBarEl;
    if (el === null) return [];
    if (typeof document === "undefined") return [];

    const map: MapEntry[] = [];
    for (const id of tocOrderIds) {
      const articleEl = document.getElementById(id);
      const tocLink = el.querySelector<HTMLElement>(`a[href="#${CSS.escape(id)}"]`);
      if (articleEl === null || tocLink === null) continue;
      const articleTop = articleEl.getBoundingClientRect().top + window.scrollY;
      map.push({
        docTop: articleTop,
        docBottom: 0,
        tocTop: tocLink.offsetTop,
        tocBottom: tocLink.offsetTop + tocLink.offsetHeight,
      });
    }

    // Each entry's doc range extends to the next entry's start, or end of doc
    // for the last entry.
    for (let i = 0; i < map.length; i++) {
      map[i].docBottom =
        i + 1 < map.length ? map[i + 1].docTop : document.documentElement.scrollHeight;
    }
    return map;
  });

  function docYToTocY(docY: number, map: MapEntry[]): number {
    if (map.length === 0) return 0;
    if (docY <= map[0].docTop) return map[0].tocTop;
    for (const entry of map) {
      if (docY >= entry.docTop && docY <= entry.docBottom) {
        const docRange = entry.docBottom - entry.docTop;
        if (docRange === 0) return entry.tocTop;
        const fraction = (docY - entry.docTop) / docRange;
        return entry.tocTop + fraction * (entry.tocBottom - entry.tocTop);
      }
    }
    return map[map.length - 1].tocBottom;
  }

  const indicatorRange = $derived.by((): { top: number; height: number } => {
    const map = headingMap;
    if (map.length === 0) return { top: 0, height: 0 };
    const viewTop = scrollY + NAV_OFFSET_PX;
    const viewBottom = scrollY + viewportHeight;
    const top = docYToTocY(viewTop, map);
    const bottom = docYToTocY(viewBottom, map);
    return { top, height: Math.max(2, bottom - top) };
  });

  function scrollToTop(): void {
    // Pin to no-section so intermediate IO fires during the smooth scroll
    // don't flap H3 lists open along the way.
    pinUntilScrollEnd(-1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function scrollToStampPrompt(): void {
    // Same pin-during-scroll trick as scrollToTop so the TOC H3 lists don't flap
    // open as the programmatic scroll passes through sections.
    pinUntilScrollEnd(-1);
    document
      .getElementById("stamp-prompt")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Localize internal links inside the rendered markdown. The body HTML is
  // cached locale-agnostically (raw paths from the sync link rewriter), so a
  // link to another doco would otherwise drop the current locale prefix and
  // send, say, a /de/ reader to the base-locale page. Patch each internal href
  // to the active locale on the client once the body renders; re-runs when the
  // body changes on navigation.
  let bodyEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    void doco.bodyHtml;
    const el = bodyEl;
    if (el === null) return;
    for (const link of el.querySelectorAll('a[href^="/"]')) {
      const href = link.getAttribute("href");
      if (href !== null) link.setAttribute("href", localizeHref(href));
    }
  });

  let copiedMarkdown = $state(false);
  async function copyMarkdown(): Promise<void> {
    await navigator.clipboard.writeText(doco.bodyText);
    copiedMarkdown = true;
    setTimeout(() => {
      copiedMarkdown = false;
    }, 2000);
  }

  let versionMenuOpen = $state(false);
  let versionMenuEl = $state<HTMLSpanElement | null>(null);

  // Close the version dropdown on any click outside its wrapper, plus on
  // Escape for keyboard users. Only wired while the menu is open so the
  // global listener doesn't run for free on every page click.
  $effect(() => {
    if (!versionMenuOpen) return;
    const onPointerDown = (e: MouseEvent): void => {
      if (versionMenuEl !== null && !versionMenuEl.contains(e.target as Node)) {
        versionMenuOpen = false;
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") versionMenuOpen = false;
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  });
</script>

<svelte:head>
  <title>{doco.title} · {data.project.displayName ?? data.project.slug} · docolin</title>
  {#if doco.description}
    <meta name="description" content={doco.description} />
  {/if}
</svelte:head>

<DocoViewerNavbar {kindSegments} {atBottom} />

<!-- pt-20 clears the fixed navbar (~50px) + reading breathing room.
     Sticky sidebars use top-20 to align below the navbar. -->
<div class="flex gap-10 px-6 pt-24 pb-10">
  <!-- Sidebar column always rendered (empty when no sitemap) so the article
       column stays at the same horizontal position regardless of project
       config. Prevents layout shift between docos with and without sitemaps. -->
  <aside class="hidden w-60 shrink-0 lg:block">
    {#if sitemap.length > 0}
      <nav class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-6">
        <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
          {data.project.displayName ?? data.project.slug}
        </p>
        <ul class="flex flex-col gap-1 text-sm">
          {#each sitemap as node, i (`${String(i)}-${node.title}`)}
            <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
            {@render sitemapNode(node, 0)}
          {/each}
        </ul>
      </nav>
    {/if}
  </aside>

  <article class="min-w-0 flex-1">
    <div class="mx-auto max-w-3xl">
      <!-- Doco header in three visual zones answering distinct reader
           questions: identity (title + description), applicability (is this
           for me / how long), authorship (who & when & trust signals).
           Noise-suppression rules: hide "stable" status (default), hide
           "0 verified" in the header (show only in the version dropdown
           where comparison is the use case), no separate "Updated X" line
           (the version's age is the only updated time we have). -->
      <header class="mb-10">
        <!-- Title row: title (left) + action cluster (top-right).
             Discussions is the prominent affordance (outlined, primary-tinted)
             since reader engagement is a first-class goal for a docs platform.
             Copy markdown shrinks to icon-only with a tooltip so the title row
             doesn't get crowded; the action is still discoverable via hover. -->
        <div class="flex items-start justify-between gap-4">
          <h1
            class="text-foreground text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {doco.title}
          </h1>
          <div class="mt-1 flex shrink-0 items-center gap-2">
            {#if signedIn}
              <!-- Moderation actions menu, signed-in only. Report (any user)
                   routes to admins; Request deletion (moderators) is the
                   version deletion-request flow. Disabled placeholders until
                   those flows are wired. -->
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <button
                      {...props}
                      class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center justify-center p-1.5 transition-colors"
                      aria-label={m.doco_actions_more()}
                      title={m.doco_actions_more()}
                    >
                      <Ellipsis class="size-3.5" />
                    </button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                  align="end"
                  class="min-w-48 whitespace-nowrap"
                  preventScroll={false}
                >
                  <DropdownMenu.Item onSelect={openReport}>
                    <Flag class="size-4" />
                    {m.doco_report()}
                  </DropdownMenu.Item>
                  {#if canModerate}
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item variant="destructive" onSelect={openRequestDeletion}>
                      <Trash2 class="size-4" />
                      {m.doco_request_deletion()}
                    </DropdownMenu.Item>
                  {/if}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            {/if}
            <a
              href={discussionsHref}
              class="border-primary/40 bg-primary/5 text-foreground hover:border-primary hover:bg-primary/10 inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <MessagesSquare class="size-3.5" />
              {m.doco_discussions_button()}
            </a>
            <button
              type="button"
              onclick={() => void copyMarkdown()}
              class="border-foreground/15 hover:border-foreground/40 text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center justify-center border p-1.5 transition-colors"
              aria-label={m.doco_copy_markdown_aria()}
              title={copiedMarkdown ? m.doco_copy_markdown_done() : m.doco_copy_markdown()}
            >
              {#if copiedMarkdown}
                <Check class="size-3.5" />
              {:else}
                <Copy class="size-3.5" />
              {/if}
            </button>
            {#if editHref}
              <!-- Icon-only edit affordance. Lower attention than copy markdown
                   (smaller audience of would-be editors), pencil icon is the
                   standard pattern; the tooltip carries the full label. -->
              <a
                href={editHref}
                target="_blank"
                rel="noopener noreferrer"
                class="border-foreground/15 hover:border-foreground/40 text-muted-foreground hover:text-foreground inline-flex items-center justify-center border p-1.5 transition-colors"
                aria-label={m.doco_edit_on_github()}
                title={m.doco_edit_on_github()}
              >
                <Pencil class="size-3.5" />
              </a>
            {/if}
          </div>
        </div>

        {#if doco.description}
          <p class="text-muted-foreground mt-3 text-lg leading-relaxed">{doco.description}</p>
        {/if}

        <!-- Applicability zone: type, difficulty, time. Prose-styled (not
             mono) since these are reading info, not technical metadata.
             Capitalized type for sentence-case appearance. -->
        <div class="text-muted-foreground mt-5 text-sm">
          <span class="text-foreground capitalize">{doco.type}</span>
          {#if doco.difficulty}
            <span class="text-muted-foreground/40"> · </span>
            <span class="capitalize">{doco.difficulty}</span>
          {/if}
          {#if timeEstimate}
            <span class="text-muted-foreground/40"> · </span>
            <span>{timeEstimate}</span>
          {/if}
        </div>

        {#if doco.appliesTo.length > 0}
          <div class="text-muted-foreground mt-1 text-sm">
            {m.doco_meta_applies_to()}
            <span class="text-foreground">{doco.appliesTo.join(", ")}</span>
          </div>
        {/if}

        <!-- Authorship zone: who wrote it, which version + how recent, and
             quiet trust signals (non-stable status, verified count when > 0).
             The version label itself is the dropdown trigger so the chevron
             stays unobtrusive instead of demanding attention as a separate
             button. -->
        <div class="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {#if doco.authors.length > 0}
            <span>
              {m.doco_meta_by()}
              {#each doco.authors as author, i (i)}
                {#if i > 0}<span>{authorSeparator(i, doco.authors.length)}</span>{/if}
                {#if author.kind === "user"}
                  <a
                    href={localizeHref(`/${author.handle}`)}
                    class="text-foreground hover:text-primary transition-colors"
                  >
                    {author.displayName ?? `@${author.handle}`}
                  </a>
                {:else if author.url !== null}
                  <a
                    href={author.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-foreground hover:text-primary transition-colors"
                  >
                    {author.name}
                  </a>
                {:else}
                  <span class="text-foreground">{author.name}</span>
                {/if}
              {/each}
            </span>
            <span class="text-muted-foreground/40">·</span>
          {/if}

          <span class="relative inline-block" bind:this={versionMenuEl}>
            <button
              type="button"
              onclick={() => (versionMenuOpen = !versionMenuOpen)}
              class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 transition-colors"
              aria-haspopup="listbox"
              aria-expanded={versionMenuOpen}
              title={dateFormatter.format(new Date(doco.publishedAt))}
            >
              <span class="text-foreground font-mono">
                {doco.versionTag ??
                  (doco.commitSha === null
                    ? `v${String(doco.versionNumber)}`
                    : doco.commitSha.slice(0, 7))}
              </span>
              <span class="text-muted-foreground/40">·</span>
              <span>{relativeTime(doco.publishedAt)}</span>
              <ChevronDown class="size-3" />
            </button>
            {#if versionMenuOpen}
              <ul
                class="border-foreground/15 bg-background absolute top-full left-0 z-10 mt-1 flex max-h-64 w-72 flex-col overflow-y-auto border text-xs shadow-md"
                role="listbox"
              >
                {#each doco.versions as v (v.versionNumber)}
                  {@const href = localizeHref(
                    `/${data.org.slug}/${data.project.slug}/${doco.pathFromProjectRoot}@${v.commitSha ?? String(v.versionNumber)}`,
                  )}
                  <li>
                    <a
                      {href}
                      onclick={() => (versionMenuOpen = false)}
                      class="hover:bg-muted/50 grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 transition-colors"
                      class:bg-muted={v.versionNumber === doco.versionNumber}
                    >
                      <span class="text-foreground font-mono">
                        {v.versionTag ??
                          (v.commitSha === null
                            ? `v${String(v.versionNumber)}`
                            : v.commitSha.slice(0, 7))}
                      </span>
                      <span class="text-muted-foreground">{relativeTime(v.publishedAt)}</span>
                      <span class="text-muted-foreground inline-flex items-center gap-1 font-mono">
                        <PawPrint class="size-3" />
                        {v.pangoScore ?? "-"}
                      </span>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </span>

          {#if doco.status !== "stable"}
            <span class="text-muted-foreground/40">·</span>
            <span class="text-amber-700">{doco.status}</span>
          {/if}
        </div>
      </header>

      {#if doco.deletedAt}
        <div class="border-destructive/40 bg-destructive/5 mb-6 flex items-start gap-3 border p-4">
          <AlertTriangle class="text-destructive mt-0.5 size-4 shrink-0" />
          <div class="text-sm">
            <p class="text-foreground font-medium">
              {m.dashboard_project_doco_badge_deleted()}
            </p>
            <p class="text-muted-foreground mt-1">
              {m.doco_deleted_body()}
            </p>
          </div>
        </div>
      {/if}

      <!-- Rendered body. .prose handles typography; the markdown renderer emits
           our callouts/admonitions; shiki handles code. -->
      <div
        bind:this={bodyEl}
        class="prose prose-stone dark:prose-invert prose-headings:scroll-mt-20 prose-headings:font-semibold prose-h1:hidden max-w-[72ch]"
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html doco.bodyHtml}
      </div>

      {#if !data.playground}
        <StampPrompt versionId={doco.versionId} score={liveScore} {signedIn} />
      {/if}

      <!-- End-of-article engagement zone. The Discussions CTA mirrors the
           top-header button, positioned where the eye lands after finishing
           the body. Edit lives at the top (next to Copy markdown) as an
           icon-only affordance for the contributor minority. -->
      <aside
        class="border-primary/40 bg-primary/5 mt-8 flex flex-col gap-3 border border-l-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      >
        <div class="min-w-0">
          <p class="text-foreground text-base font-medium">
            {m.doco_discussions_cta_title()}
          </p>
          <p class="text-muted-foreground mt-1 text-sm leading-relaxed">
            {m.doco_discussions_cta_body()}
          </p>
        </div>
        <a
          href={discussionsHref}
          class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
        >
          <MessagesSquare class="size-4" />
          {m.doco_discussions_cta_action()}
        </a>
      </aside>

      {#if doco.prevNav !== null || doco.nextNav !== null}
        <footer class="mt-8 grid gap-4 text-sm md:grid-cols-2">
          {#if doco.prevNav}
            <a
              href={doco.prevNav.kind === "resolved"
                ? localizeHref(doco.prevNav.href)
                : doco.prevNav.href}
              class="group border-foreground/15 hover:border-primary hover:text-foreground flex items-center gap-3 border p-4 transition-all hover:-translate-x-1"
            >
              <ArrowLeft
                class="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-colors"
              />
              <span class="flex min-w-0 flex-col">
                {#if doco.prevNav.kind === "resolved"}
                  <span class="text-foreground truncate font-medium">{doco.prevNav.title}</span>
                  <span class="text-muted-foreground truncate font-mono text-xs">
                    {doco.prevNav.kindPath}
                  </span>
                {:else}
                  <span class="text-foreground truncate font-mono text-sm">
                    {doco.prevNav.href}
                  </span>
                {/if}
              </span>
            </a>
          {:else}
            <div class="hidden md:block"></div>
          {/if}
          {#if doco.nextNav}
            <a
              href={doco.nextNav.kind === "resolved"
                ? localizeHref(doco.nextNav.href)
                : doco.nextNav.href}
              class="group border-foreground/15 hover:border-primary hover:text-foreground flex items-center gap-3 border p-4 text-right transition-all hover:translate-x-1 md:justify-end"
            >
              <span class="flex min-w-0 flex-col items-end">
                {#if doco.nextNav.kind === "resolved"}
                  <span class="text-foreground truncate font-medium">{doco.nextNav.title}</span>
                  <span class="text-muted-foreground truncate font-mono text-xs">
                    {doco.nextNav.kindPath}
                  </span>
                {:else}
                  <span class="text-foreground truncate font-mono text-sm">
                    {doco.nextNav.href}
                  </span>
                {/if}
              </span>
              <ArrowRight
                class="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-colors"
              />
            </a>
          {:else}
            <div class="hidden md:block"></div>
          {/if}
        </footer>
      {/if}
    </div>
  </article>

  <!-- TOC column always rendered (empty when no headings) so the article
       column doesn't shift horizontally between short and long docos. -->
  <aside class="hidden w-60 shrink-0 xl:block">
    <div class="sticky top-20 pb-6">
      {#if !data.playground}
        <PangoScoreRail
          score={liveScore}
          verifiedCount={liveCount}
          lastConfirmedAt={liveConfirmed}
          onStampIt={scrollToStampPrompt}
        />
      {/if}
      {#if tocTree.length > 0}
        <nav>
          <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
            {m.doco_toc_heading()}
          </p>

          <!-- Layered scroll indicator:
             - background line: muted, full TOC height
             - active segment: primary, mapped proportionally from the
               viewport's doc range to TOC y-range via headingMap. Slides
               smoothly within each section as you scroll through its body;
               grows/shrinks based on how much of the doc is on screen.
             Items get left padding to clear the bar. No per-item borders to
             avoid two competing indicators. No CSS transition: with frequent
             scroll updates a transition just adds visible lag. -->
          <div class="relative" bind:this={tocBarEl}>
            <div class="bg-foreground/15 absolute top-0 bottom-0 left-0 w-px"></div>
            <div
              class="bg-primary absolute left-0 w-px"
              style:top="{indicatorRange.top}px"
              style:height="{indicatorRange.height}px"
            ></div>

            <ul class="flex flex-col text-sm">
              <li>
                <button
                  type="button"
                  onclick={scrollToTop}
                  class="text-muted-foreground hover:text-foreground block w-full cursor-pointer py-1 pr-2 pl-3 text-left transition-colors"
                >
                  ↑ {m.doco_toc_back_to_top()}
                </button>
              </li>
              {#each tocTree as section, i (section.h2.id)}
                <li>
                  <a
                    href={"#" + section.h2.id}
                    onclick={() => {
                      pinSectionForId(section.h2.id);
                    }}
                    class="block py-1 pr-2 pl-3 transition-colors"
                    class:text-foreground={i === activeSectionIndex}
                    class:font-medium={i === activeSectionIndex}
                    class:text-muted-foreground={i !== activeSectionIndex}
                    class:hover:text-foreground={i !== activeSectionIndex}
                  >
                    {section.h2.text}
                  </a>
                  {#if i === expandedSectionIndex && section.h3s.length > 0}
                    <ul transition:slide={{ duration: 150 }} class="flex flex-col">
                      {#each section.h3s as h3 (h3.id)}
                        <li>
                          <a
                            href={"#" + h3.id}
                            onclick={() => {
                              pinSectionForId(h3.id);
                            }}
                            class="block py-1 pr-2 pl-6 transition-colors"
                            class:text-foreground={activeId === h3.id}
                            class:font-medium={activeId === h3.id}
                            class:text-muted-foreground={activeId !== h3.id}
                            class:hover:text-foreground={activeId !== h3.id}
                          >
                            {h3.text}
                          </a>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        </nav>
      {/if}
    </div>
  </aside>
</div>

<!-- Subtle fade-to-background at viewport bottom. Hints "there's more below"
     without being visually loud. Fixed positioning so it stays as the reader
     scrolls; pointer-events-none so it doesn't intercept clicks. -->
<div
  aria-hidden="true"
  class="from-background pointer-events-none fixed inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t to-transparent"
></div>

{#snippet sitemapNode(node: SitemapNode, depth: number)}
  {@const isActive = node.url !== undefined && node.url === currentPageUrl}
  <li>
    {#if node.url}
      <a
        href={localizeHref(node.url)}
        class="block py-0.5 transition-colors"
        class:text-foreground={isActive}
        class:font-medium={isActive}
        class:text-muted-foreground={!isActive}
        class:hover:text-foreground={!isActive}
        style:padding-left="{String(depth * 12)}px"
        aria-current={isActive ? "page" : undefined}
      >
        {node.title}
      </a>
    {:else}
      <div class="text-foreground py-1 font-medium" style:padding-left="{depth * 12}px">
        {node.title}
      </div>
    {/if}
    {#if node.children && node.children.length > 0}
      <ul class="flex flex-col gap-1">
        {#each node.children as child, i (`${String(i)}-${child.title}`)}
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
          {@render sitemapNode(child, depth + 1)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<!-- Moderation dialogs for the displayed version (portaled, position-agnostic). -->
<ReportDialog bind:open={reportOpen} target={reportTarget} />
<RequestDeletionDialog bind:open={requestDeletionOpen} target={requestDeletionTarget} />
