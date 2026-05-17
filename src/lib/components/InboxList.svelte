<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import CheckCircle from "@lucide/svelte/icons/check-circle";
  import XCircle from "@lucide/svelte/icons/x-circle";
  import Bell from "@lucide/svelte/icons/bell";
  import CheckCheck from "@lucide/svelte/icons/check-check";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import Search from "@lucide/svelte/icons/search";

  // Shared row-list for both /dashboard/inbox and /dashboard/inbox/done.
  // Subject + single-line preview + timestamp per row. Click row to open
  // the detail page. Read messages get a muted treatment; unread stay full
  // attention via subject weight.
  //
  // Each row has an inline action button on the right edge: mark-done in
  // the Inbox bucket, move-back-to-inbox in the Done bucket. Action and
  // row-link are separate click targets so navigation and dismissal don't
  // overlap.

  interface Message {
    id: string;
    kind: string;
    subject: string;
    preview: string;
    hasLink: boolean;
    readAt: string | null;
    createdAt: string;
  }

  let {
    messages,
    bucket,
    emptyTitle,
    emptyBody,
  }: {
    messages: Message[];
    bucket: "inbox" | "done";
    emptyTitle: string;
    emptyBody: string;
  } = $props();

  const dateFormatter = $derived(new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }));

  function kindLabel(kind: string): string {
    if (kind === "claim_approved") return m.inbox_kind_claim_approved();
    if (kind === "claim_cancelled") return m.inbox_kind_claim_cancelled();
    return m.inbox_kind_generic();
  }

  const rowActionAttrs = $derived(
    bucket === "inbox"
      ? {
          formAction: "?/markDone",
          ariaLabel: m.inbox_action_mark_done(),
          icon: CheckCheck,
        }
      : {
          formAction: "?/markUndone",
          ariaLabel: m.inbox_action_move_back(),
          icon: Undo2,
        },
  );

  // Client-side filter. At pre-alpha volume the loaded set is small;
  // substring match across subject, preview, and kind label covers the
  // common "find that one notification" case without a server round-trip.
  let query = $state("");
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return messages;
    return messages.filter((msg) => {
      const haystack = [msg.subject, msg.preview, kindLabel(msg.kind)].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  });
</script>

{#if messages.length === 0}
  <div class="flex flex-col items-center py-16 text-center">
    <h2 class="text-foreground text-xl font-medium tracking-tight">{emptyTitle}</h2>
    <p class="text-muted-foreground mt-2 text-sm">{emptyBody}</p>
  </div>
{:else}
  <!-- Search input: substring match against subject, preview, kind label.
       Sits above the scrollable list so it stays in view while the list
       scrolls. Auto-focuses for keyboard-first access. -->
  <div class="relative mb-4">
    <Search
      class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
    />
    <Input
      type="search"
      bind:value={query}
      placeholder={m.inbox_search_placeholder()}
      aria-label={m.inbox_search_placeholder()}
      class="h-10 pl-9"
    />
  </div>

  {#if filtered.length === 0}
    <p class="text-muted-foreground py-8 text-center text-sm">
      {m.inbox_search_no_match()}
    </p>
  {:else}
    <!-- Each item is a self-contained bordered card; gap between cards
         creates clear visual separation. Hover shifts border to primary,
         matching the org-card language elsewhere in the dashboard.
         ScrollArea gives the list its own scroll viewport so marking a row
         done doesn't shift the page chrome above. dvh (dynamic viewport
         height) handles mobile browser chrome correctly. Subtracting 18rem
         instead of 14rem to account for the search input above. -->
    <ScrollArea class="h-[calc(100dvh-18rem)]">
      <ul class="flex flex-col gap-3 pr-3">
        {#each filtered as msg (msg.id)}
          {@const isUnread = msg.readAt === null}
          {@const Icon =
            msg.kind === "claim_approved"
              ? CheckCircle
              : msg.kind === "claim_cancelled"
                ? XCircle
                : Bell}
          {@const RowIcon = rowActionAttrs.icon}
          <li
            class={isUnread
              ? "bg-primary/10 border-primary/40 hover:border-primary group/row flex items-center gap-3 border p-3 transition-colors sm:p-4"
              : "bg-background border-foreground/15 hover:border-primary group/row flex items-center gap-3 border p-3 transition-colors sm:p-4"}
          >
            <a href="/dashboard/inbox/{msg.id}" class="flex min-w-0 flex-1 items-start gap-3">
              <Icon
                class={isUnread
                  ? "text-primary mt-0.5 size-4 shrink-0"
                  : "text-muted-foreground mt-0.5 size-4 shrink-0"}
              />
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <div class="flex items-baseline justify-between gap-3">
                  <span
                    class={isUnread
                      ? "text-foreground truncate text-sm font-medium"
                      : "text-muted-foreground truncate text-sm"}
                  >
                    {msg.subject}
                  </span>
                  <span class="text-muted-foreground shrink-0 text-xs">
                    {dateFormatter.format(new Date(msg.createdAt))}
                  </span>
                </div>
                <div class="flex items-baseline justify-between gap-3">
                  <span class="text-muted-foreground truncate text-xs">
                    {msg.preview}
                  </span>
                  <span
                    class="text-muted-foreground/70 shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase"
                  >
                    {kindLabel(msg.kind)}
                  </span>
                </div>
              </div>
            </a>
            <!-- Inline row action: marks done (Inbox) or moves back (Done).
             Ghost variant (no border) so it doesn't compete with the
             text-heavy row content; hover gives bg-muted + primary icon
             via the shadcn defaults. Separate click target from the row
             link. use:enhance keeps the page in place; the row drops
             from the list because the load filter excludes it. -->
            <form method="POST" action={rowActionAttrs.formAction} use:enhance class="shrink-0">
              <input type="hidden" name="id" value={msg.id} />
              <Button
                type="submit"
                variant="ghost"
                size="icon-lg"
                class="text-muted-foreground/60 hover:text-primary cursor-pointer"
                aria-label={rowActionAttrs.ariaLabel}
                title={rowActionAttrs.ariaLabel}
              >
                <RowIcon class="size-4" />
              </Button>
            </form>
          </li>
        {/each}
      </ul>
    </ScrollArea>
  {/if}
{/if}
