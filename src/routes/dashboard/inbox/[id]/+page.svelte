<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import CheckCircle from "@lucide/svelte/icons/check-circle";
  import XCircle from "@lucide/svelte/icons/x-circle";
  import Bell from "@lucide/svelte/icons/bell";
  import CheckCheck from "@lucide/svelte/icons/check-check";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const msg = $derived(data.message);

  const isDone = $derived(msg.doneAt !== null);

  const dateFormatter = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }),
  );

  function kindLabel(kind: string): string {
    if (kind === "claim_approved") return m.inbox_kind_claim_approved();
    if (kind === "claim_cancelled") return m.inbox_kind_claim_cancelled();
    return m.inbox_kind_generic();
  }

  const Icon = $derived(
    msg.kind === "claim_approved" ? CheckCircle : msg.kind === "claim_cancelled" ? XCircle : Bell,
  );
</script>

<svelte:head>
  <title>{msg.subject} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<!-- Header row: kind/timestamp metadata on the left, state action on the
     right. Back-to-list navigation is the sidebar's job; no duplicate
     back link here. Body-level CTAs (open the thing, appeal, view
     discussion) come from the writer's :::btn directive in the body. -->
<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
  <div class="flex items-center gap-2">
    <Icon class="text-muted-foreground size-4" />
    <span class="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
      {kindLabel(msg.kind)}
    </span>
    <span class="text-muted-foreground" aria-hidden="true">·</span>
    <span class="text-muted-foreground text-xs">
      {dateFormatter.format(new Date(msg.createdAt))}
    </span>
  </div>

  {#if isDone}
    <form method="POST" action="?/markUndone" use:enhance>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        class="text-muted-foreground hover:text-foreground h-9 cursor-pointer gap-2 px-3"
      >
        <Undo2 class="size-4" />
        {m.inbox_action_move_back()}
      </Button>
    </form>
  {:else}
    <form method="POST" action="?/markDone" use:enhance>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        class="text-muted-foreground hover:text-primary h-9 cursor-pointer gap-2 px-3"
      >
        <CheckCheck class="size-4" />
        {m.inbox_action_mark_done()}
      </Button>
    </form>
  {/if}
</div>

<!-- Subject as the page title. Body opens with substance, not a restatement
     of the subject. -->
<h1 class="text-foreground text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
  {msg.subject}
</h1>

<!-- Rendered body. Writers own content-level CTAs via :::btn directive;
     this page does NOT auto-generate an "Open" button from linkUrl, which
     would duplicate the body's CTA when present. @html is safe: bodyHtml
     comes from renderMarkdown in src/lib/server/markdown.ts which runs
     DOMPurify. -->
<div class="prose prose-sm text-foreground/90 mt-8 max-w-none leading-relaxed">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- bodyHtml is sanitized server-side -->
  {@html msg.bodyHtml}
</div>
