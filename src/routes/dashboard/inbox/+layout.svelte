<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import Inbox from "@lucide/svelte/icons/inbox";
  import CheckCheck from "@lucide/svelte/icons/check-check";

  let { children }: { children: Snippet } = $props();

  const isInbox = $derived(page.url.pathname === "/dashboard/inbox");
  const isDone = $derived(page.url.pathname === "/dashboard/inbox/done");
</script>

<!-- Email-client layout: left rail with views (Inbox, Done), main area
     renders whichever child route is active (list or detail). Rail collapses
     to a horizontal strip on narrow screens. -->
<div class="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:gap-10">
  <aside class="shrink-0 sm:w-44">
    <nav class="flex flex-row gap-1 sm:flex-col">
      <a
        href="/dashboard/inbox"
        class={isInbox
          ? "bg-muted text-foreground flex items-center gap-2 px-3 py-2 text-sm font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-2 px-3 py-2 text-sm transition-colors"}
      >
        <Inbox class="size-4" />
        <span>{m.inbox_nav_inbox()}</span>
        {#if page.data.inboxUnreadCount > 0 && !isInbox}
          <span class="bg-primary ml-auto size-2 rounded-full" aria-hidden="true"></span>
        {/if}
      </a>
      <a
        href="/dashboard/inbox/done"
        class={isDone
          ? "bg-muted text-foreground flex items-center gap-2 px-3 py-2 text-sm font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-2 px-3 py-2 text-sm transition-colors"}
      >
        <CheckCheck class="size-4" />
        <span>{m.inbox_nav_done()}</span>
      </a>
    </nav>
  </aside>

  <main class="min-w-0 flex-1">
    {@render children()}
  </main>
</div>
