<script lang="ts">
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import { kindLabel } from "$lib/kind-label";
  import { relativeTime } from "$lib/relative-time";
  import type { ListedDoco } from "$lib/server/doco-rows";

  // One doco in the browse feed. Same bones as the profile row (title link,
  // Pango right-aligned, quiet meta line), plus the activity chip that says
  // WHY something is trending; an unexplained ranking reads as editorial.
  interface Props {
    doco: ListedDoco;
    activity?: { stamps: number; discussions: number } | null;
    // One-line mode for the tail of a graduated list: the top rows carry the
    // descriptions and reasons, the tail just needs to be scannable.
    compact?: boolean;
  }
  let { doco, activity = null, compact = false }: Props = $props();

  const kindPath = $derived(doco.kind.split("/").map(kindLabel).join(" / "));
  const showActivity = $derived(
    activity !== null && (activity.stamps > 0 || activity.discussions > 0),
  );
</script>

{#if compact}
  <!-- items-center + w-full so the row can sit in a stretched list item when
       its column is height-matched against the neighboring column. -->
  <a
    href={localizeHref(doco.href)}
    class="hover:bg-accent group flex w-full items-center justify-between gap-3 px-4 py-2 transition-colors"
  >
    <span
      class="text-foreground group-hover:text-primary truncate text-sm font-medium transition-colors"
    >
      {doco.title}
    </span>
    <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
      {#if doco.pangoScore !== null}
        {m.profile_pango({ score: doco.pangoScore })}
        <span aria-hidden="true">·</span>
      {/if}
      {relativeTime(doco.publishedAt, getLocale())}
    </span>
  </a>
{:else}
  <a href={localizeHref(doco.href)} class="hover:bg-accent group block px-4 py-3 transition-colors">
    <span class="flex items-baseline justify-between gap-3">
      <span
        class="text-foreground group-hover:text-primary truncate text-base font-medium transition-colors"
      >
        {doco.title}
      </span>
      {#if doco.pangoScore !== null}
        <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
          {m.profile_pango({ score: doco.pangoScore })}
        </span>
      {/if}
    </span>
    {#if doco.description}
      <span class="text-muted-foreground mt-0.5 line-clamp-1 block text-sm">
        {doco.description}
      </span>
    {/if}
    <span class="text-muted-foreground/80 mt-1 block text-xs">
      {#if showActivity && activity !== null}
        <span class="text-primary">
          {#if activity.stamps > 0}
            {activity.stamps === 1
              ? m.browse_activity_stamps_one()
              : m.browse_activity_stamps_other({ count: activity.stamps })}
          {/if}
          {#if activity.stamps > 0 && activity.discussions > 0}
            <span aria-hidden="true">·</span>
          {/if}
          {#if activity.discussions > 0}
            {activity.discussions === 1
              ? m.browse_activity_discussions_one()
              : m.browse_activity_discussions_other({ count: activity.discussions })}
          {/if}
        </span>
        <span aria-hidden="true">·</span>
      {/if}
      {kindPath}
      <span aria-hidden="true">·</span>
      {doco.projectLabel}
      <span aria-hidden="true">·</span>
      {relativeTime(doco.publishedAt, getLocale())}
    </span>
  </a>
{/if}
