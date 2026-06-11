<script lang="ts">
  import { m } from "$paraglide/messages";
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import type { DiscussionStatus } from "$lib/server/discussions";

  // Discussion status indicator. Open is the active/primary state, resolved
  // reads as success, closed is muted. Icon + text rather than color alone so
  // the meaning survives for color-impaired readers (CLAUDE.md 11.1).
  //   - default: icon + label in the status color (used inline)
  //   - compact: icon only (dense list rows), label kept for screen readers
  //   - pill: filled badge for the thread header, where status must read loud
  interface Props {
    status: DiscussionStatus;
    compact?: boolean;
    pill?: boolean;
  }
  let { status, compact = false, pill = false }: Props = $props();

  const Icon = $derived(
    status === "resolved" ? CircleCheck : status === "closed" ? CircleX : CircleDot,
  );
  const color = $derived(
    status === "resolved"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "closed"
        ? "text-muted-foreground"
        : "text-primary",
  );
  const pillColor = $derived(
    status === "resolved"
      ? "bg-emerald-600 text-white"
      : status === "closed"
        ? "border-foreground/15 bg-muted text-muted-foreground border"
        : "bg-primary text-primary-foreground",
  );
  const label = $derived(
    status === "resolved"
      ? m.discussion_status_resolved()
      : status === "closed"
        ? m.discussion_status_closed()
        : m.discussion_status_open(),
  );
</script>

{#if pill}
  <span class="inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium {pillColor}">
    <Icon class="size-4 shrink-0" />
    {label}
  </span>
{:else}
  <span class="inline-flex items-center gap-1.5 {color}">
    <Icon class="size-4 shrink-0" />
    {#if !compact}
      <span class="text-sm font-medium">{label}</span>
    {:else}
      <span class="sr-only">{label}</span>
    {/if}
  </span>
{/if}
