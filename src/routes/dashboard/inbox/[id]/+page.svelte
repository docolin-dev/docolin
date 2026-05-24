<script lang="ts">
  import { onMount } from "svelte";
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import CheckCircle from "@lucide/svelte/icons/check-circle";
  import XCircle from "@lucide/svelte/icons/x-circle";
  import Bell from "@lucide/svelte/icons/bell";
  import CheckCheck from "@lucide/svelte/icons/check-check";
  import Undo2 from "@lucide/svelte/icons/undo-2";

  interface MessagePayload {
    message: {
      id: string;
      kind: string;
      subject: string;
      bodyHtml: string;
      linkUrl: string | null;
      doneAt: string | null;
      createdAt: string;
    };
  }

  let payload = $state<MessagePayload | null>(null);
  let loadError = $state<string | null>(null);

  async function loadMessage(): Promise<void> {
    loadError = null;
    try {
      const res = await fetch(`/api/dashboard/inbox/${encodeURIComponent(messageId)}`, {
        credentials: "same-origin",
      });
      if (res.status === 401) return;
      if (res.status === 404) {
        loadError = "404";
        return;
      }
      if (!res.ok) {
        loadError = `HTTP ${res.status.toString()}`;
        return;
      }
      payload = (await res.json()) as MessagePayload;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  // The message id is the URL parameter. SvelteKit doesn't expose params on
  // a shell-only +page.server.ts so we read it from page state on mount.
  let messageId = $state("");

  onMount(() => {
    const segs = window.location.pathname.split("/").filter(Boolean);
    const idx = segs.indexOf("inbox");
    messageId = idx >= 0 && segs[idx + 1] ? decodeURIComponent(segs[idx + 1]) : "";
    void loadMessage();
  });

  const msg = $derived(payload?.message ?? null);
  const isDone = $derived(msg !== null && msg.doneAt !== null);

  const dateFormatter = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }),
  );

  function kindLabel(kind: string): string {
    if (kind === "claim_approved") return m.inbox_kind_claim_approved();
    if (kind === "claim_cancelled") return m.inbox_kind_claim_cancelled();
    return m.inbox_kind_generic();
  }

  const Icon = $derived(
    msg === null
      ? Bell
      : msg.kind === "claim_approved"
        ? CheckCircle
        : msg.kind === "claim_cancelled"
          ? XCircle
          : Bell,
  );
</script>

<svelte:head>
  <title>{(msg?.subject ?? m.inbox_meta_title()) + " · docolin"}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if loadError !== null}
  <div
    class="border-destructive/40 bg-destructive/5 mb-6 flex items-center justify-between gap-4 border p-4"
  >
    <p class="text-destructive text-sm">{m.dashboard_load_error()}</p>
    <Button type="button" variant="outline" size="sm" onclick={() => void loadMessage()}>
      {m.dashboard_load_error_retry()}
    </Button>
  </div>
{/if}

<!-- Header row: kind/timestamp metadata on the left, state action on the
     right. The skeleton reserves the same row height as the loaded state so
     the subject heading below doesn't shift when content lands. -->
<div class="mb-3 flex flex-wrap items-center justify-between gap-3" style="min-height: 36px;">
  {#if msg}
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
  {:else if loadError === null}
    <div class="bg-muted h-4 w-48 animate-pulse"></div>
    <div class="bg-muted h-9 w-32 animate-pulse"></div>
  {/if}
</div>

<!-- Subject heading. Placeholder while loading reserves the same height so
     the body doesn't shift up when the subject arrives. -->
{#if msg}
  <h1 class="text-foreground text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
    {msg.subject}
  </h1>
{:else if loadError === null}
  <div class="bg-muted h-9 w-3/4 animate-pulse"></div>
{/if}

<!-- Rendered body. min-height reserves space for the typical message body so
     content below the message (none in this layout) doesn't shift; the prose
     class handles typography. -->
<div
  class="prose prose-sm dark:prose-invert text-foreground/90 mt-8 max-w-none leading-relaxed"
  style="min-height: 8rem;"
>
  {#if msg}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- bodyHtml is sanitized server-side -->
    {@html msg.bodyHtml}
  {:else if loadError === null}
    <div class="bg-muted mb-3 h-4 w-full animate-pulse"></div>
    <div class="bg-muted mb-3 h-4 w-11/12 animate-pulse"></div>
    <div class="bg-muted h-4 w-3/4 animate-pulse"></div>
  {/if}
</div>
