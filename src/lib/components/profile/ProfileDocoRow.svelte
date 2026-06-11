<script lang="ts">
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import { kindLabel } from "$lib/kind-label";
  import { relativeTime } from "$lib/relative-time";
  import type { ProfileDoco } from "$lib/server/profile";

  // One doco in a profile list. The title carries the link; the meta line
  // answers "about what, where, how fresh" without competing with it. Pango
  // sits right-aligned so verified work is scannable down the column.
  interface Props {
    doco: ProfileDoco;
    // Person pages list docos from many projects, so the row names its
    // project; org project cards already carry that context.
    showProject?: boolean;
    // Leading kind segments shared by every row in this list (see
    // kind-prefix.ts); repeating them on each row would be noise.
    dropKindSegments?: number;
  }
  let { doco, showProject = false, dropKindSegments = 0 }: Props = $props();

  // kindLabel translates one segment; the row shows the distinguishing tail of
  // the labeled path. Empty (fully shared) paths drop out of the meta line.
  const kindPath = $derived(
    doco.kind.split("/").slice(dropKindSegments).map(kindLabel).join(" / "),
  );
</script>

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
    {#if kindPath.length > 0}
      {kindPath}
      <span aria-hidden="true">·</span>
    {/if}
    {#if showProject}
      {doco.projectLabel}
      <span aria-hidden="true">·</span>
    {/if}
    {relativeTime(doco.publishedAt, getLocale())}
  </span>
</a>
