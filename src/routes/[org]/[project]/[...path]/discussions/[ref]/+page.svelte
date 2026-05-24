<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Flag from "@lucide/svelte/icons/flag";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import ShieldAlert from "@lucide/svelte/icons/shield-alert";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Input } from "$lib/components/ui/input";
  import MarkdownEditor from "$lib/components/discussions/MarkdownEditor.svelte";
  import FormattingHint from "$lib/components/discussions/FormattingHint.svelte";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import StatusBadge from "$lib/components/discussions/StatusBadge.svelte";
  import Composer from "$lib/components/discussions/Composer.svelte";
  import ReportDialog from "$lib/components/moderation/ReportDialog.svelte";
  import RequestDeletionDialog from "$lib/components/moderation/RequestDeletionDialog.svelte";
  import DeleteConfirm from "$lib/components/moderation/DeleteConfirm.svelte";
  import type { ModerationTargetType } from "$lib/moderation-reasons";
  import { session } from "$lib/client/session.svelte";
  import { relativeTime } from "$lib/relative-time";
  import { discussionRef } from "$lib/doco-urls";
  import type { ThreadReply } from "$lib/server/discussions";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const thread = $derived(data.thread);

  const discussionsBase = $derived(
    `/${data.org.slug}/${data.project.slug}/${data.docoPath}/discussions`,
  );
  const threadPath = $derived(`${discussionsBase}/${discussionRef(thread.number, thread.title)}`);

  // Per-user controls. Owner checks compare the public author handle to the
  // session handle (no server call); moderator power comes from the
  // capabilities endpoint, fetched only when signed in (anonymous viewers
  // can never moderate, so they skip the round-trip).
  let canModerate = $state(false);
  let capsFetched = false;
  $effect(() => {
    if (!session.loaded || session.value.dbUser === null || capsFetched) return;
    capsFetched = true;
    void (async () => {
      const res = await fetch(`/api/discussions/${thread.id}/capabilities`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const caps = (await res.json()) as { canModerate: boolean };
        canModerate = caps.canModerate;
      }
    })();
  });

  const myHandle = $derived(session.value.dbUser?.handle ?? null);
  const signedIn = $derived(session.value.dbUser !== null);
  // Editing is author-only: moderators don't edit other people's content (the
  // admin path for that is redaction, a separate action). Status changes and
  // deletion are author-or-moderator.
  const isMyOp = $derived(myHandle !== null && myHandle === thread.op.authorHandle);
  const canManageOp = $derived(isMyOp || canModerate);
  function isMyReply(r: ThreadReply): boolean {
    return myHandle !== null && myHandle === r.authorHandle;
  }

  let editingOp = $state(false);
  let editingReplyId = $state<string | null>(null);

  // Moderation dialogs. One shared instance of each lives at the page root; a
  // kebab item sets the target then opens it. Report = others' content; Delete =
  // own (author_request); Request deletion = moderator on others'. Splitting by
  // own/others is what implements the self-report redirect (own content offers
  // Delete, not Report) without a separate "did you mean to delete?" modal.
  interface ModTarget {
    type: ModerationTargetType;
    id: string;
  }
  let reportTarget = $state<ModTarget | null>(null);
  let reportOpen = $state(false);
  let requestDeletionTarget = $state<ModTarget | null>(null);
  let requestDeletionOpen = $state(false);
  let deleteTarget = $state<ModTarget | null>(null);
  let deleteOpen = $state(false);

  function openReport(type: ModerationTargetType, id: string): void {
    reportTarget = { type, id };
    reportOpen = true;
  }
  function openRequestDeletion(type: ModerationTargetType, id: string): void {
    requestDeletionTarget = { type, id };
    requestDeletionOpen = true;
  }
  function openDelete(type: ModerationTargetType, id: string): void {
    deleteTarget = { type, id };
    deleteOpen = true;
  }

  // Props for the shared comment-header snippet. An object (not positional
  // args) so the growing set of flags/callbacks stays readable and order-safe.
  interface PostHeaderProps {
    handle: string;
    displayName: string | null;
    createdAt: string;
    isEdited: boolean;
    isOpAuthor: boolean;
    // The moderation target this post is, so the kebab's report / delete items
    // act on the right row.
    targetType: ModerationTargetType;
    targetId: string;
    // Whether the viewer authored this post: own content offers Edit + Delete,
    // others' offers Report (+ Request deletion for moderators).
    isOwn: boolean;
    // Show the Edit item: author-only, and not already editing it.
    canEdit: boolean;
    // Anchor (#comment-...) the timestamp links to (per-post permalink).
    permalink: string;
    // True when this post is the thread's accepted answer (shows a chip).
    isAnswer: boolean;
    // Replies only: show the "Mark / Unmark as answer" menu item (thread author
    // or moderator). Omitted for the original post.
    canMarkAnswer?: boolean;
    onMarkAnswer?: () => void;
    onEdit: () => void;
    onToggleHistory: () => void;
  }

  // Submits a reply's hidden setAnswer form (so the menu item triggers the
  // use:enhance form rather than calling the action by hand).
  function submitAnswerForm(replyId: string): void {
    const el = document.getElementById(`answer-${replyId}`);
    if (el instanceof HTMLFormElement) el.requestSubmit();
  }

  // Public edit history (the "edited" dropdown). Lazy-fetched per post on first
  // open and cached, so it never bloats the thread payload.
  interface EditVersion {
    id: string;
    editedAt: string;
    bodyHtml: string;
    removed: boolean;
  }
  let historyOpenFor = $state<string | null>(null);
  let historyLoading = $state<string | null>(null);
  // Entries are absent until fetched, so the value type includes undefined.
  let historyCache = $state<Record<string, EditVersion[] | undefined>>({});
  async function toggleHistory(kind: "discussion" | "reply", id: string): Promise<void> {
    if (historyOpenFor === id) {
      historyOpenFor = null;
      return;
    }
    historyOpenFor = id;
    if (historyCache[id] !== undefined) return;
    historyLoading = id;
    try {
      const res = await fetch(`/api/discussions/edits/${kind}/${id}`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = (await res.json()) as { versions: EditVersion[] };
        historyCache[id] = data.versions;
      }
    } finally {
      historyLoading = null;
    }
  }

  const dateFormatter = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }),
  );

  // Defensive read of the action result, whose union shape varies per action.
  const f = $derived((form ?? null) as Record<string, unknown> | null);
  function field(key: string): string | undefined {
    const v = f?.[key];
    return typeof v === "string" ? v : undefined;
  }
  function errorMessage(code: string | undefined): string | null {
    if (code === "reply_required") return m.discussion_error_reply_required();
    if (code === "title_required") return m.discussion_error_title_required();
    if (code === "body_required") return m.discussion_error_body_required();
    if (code === "forbidden") return m.discussion_error_forbidden();
    if (code === undefined) return null;
    return m.discussion_error_generic();
  }
  const replyError = $derived(field("action") === "reply" ? errorMessage(field("error")) : null);
</script>

<svelte:head>
  <title>{thread.title} · docolin</title>
</svelte:head>

<DocoViewerNavbar kindSegments={data.kindSegments} />

<!-- Header strip for one comment: who + when + author badge on the left,
     edit / report on the right. Shared by the original post and every reply so
     the thread reads as a stack of contained comments. -->
{#snippet postHeader(p: PostHeaderProps)}
  <!-- min-h keeps the strip a fixed (thin) height whether or not the kebab is
       present, so revealing it after hydration causes no layout shift. -->
  <div
    class="border-foreground/15 bg-muted/40 flex min-h-10 items-center justify-between gap-3 border-b px-4 py-1.5"
  >
    <div class="min-w-0 text-sm">
      <a
        href={localizeHref(`/${p.handle}`)}
        class="text-foreground hover:text-primary font-medium transition-colors"
      >
        {p.displayName ?? `@${p.handle}`}
      </a>
      <a
        href={p.permalink}
        class="text-muted-foreground hover:text-foreground underline-offset-2 transition-colors hover:underline"
        title={dateFormatter.format(new Date(p.createdAt))}
        aria-label={m.discussion_post_permalink()}
      >
        {relativeTime(p.createdAt, getLocale())}
      </a>
      {#if p.isEdited}
        <span class="text-muted-foreground/40">·</span>
        <button
          type="button"
          onclick={p.onToggleHistory}
          class="text-muted-foreground hover:text-foreground italic underline-offset-2 transition-colors hover:underline"
        >
          {m.discussion_post_edited()}
        </button>
      {/if}
    </div>
    <!-- Right cluster: answer chip, author badge, then the actions menu. -->
    <div class="flex shrink-0 items-center gap-2">
      {#if p.isAnswer}
        <span
          class="inline-flex items-center gap-1 border border-emerald-500/40 bg-emerald-50 px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide text-emerald-700 uppercase"
        >
          <CircleCheck class="size-3" />
          {m.discussion_answer_badge()}
        </span>
      {/if}
      {#if p.isOpAuthor}
        <span
          class="border-foreground/15 text-muted-foreground border px-1.5 py-0.5 text-[0.65rem] tracking-wide uppercase"
        >
          {m.discussion_post_author()}
        </span>
      {/if}
      {#if signedIn}
        {@const hasConstructive = p.canEdit || p.canMarkAnswer === true || !p.isOwn}
        {@const hasDestructive = (canModerate && !p.isOwn) || p.isOwn}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center transition-colors"
                aria-label={m.discussion_post_more()}
                title={m.discussion_post_more()}
              >
                <Ellipsis class="size-4" />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            align="end"
            class="min-w-44 whitespace-nowrap"
            preventScroll={false}
          >
            {#if p.canEdit}
              <DropdownMenu.Item onSelect={p.onEdit}>
                <Pencil class="size-4" />
                {m.discussion_post_edit()}
              </DropdownMenu.Item>
            {/if}
            {#if p.canMarkAnswer}
              <DropdownMenu.Item onSelect={p.onMarkAnswer}>
                <CircleCheck class="size-4" />
                {p.isAnswer ? m.discussion_post_unmark_answer() : m.discussion_post_mark_answer()}
              </DropdownMenu.Item>
            {/if}
            {#if !p.isOwn}
              <DropdownMenu.Item
                onSelect={() => {
                  openReport(p.targetType, p.targetId);
                }}
              >
                <Flag class="size-4" />
                {m.discussion_post_report()}
              </DropdownMenu.Item>
            {/if}
            {#if hasConstructive && hasDestructive}
              <DropdownMenu.Separator />
            {/if}
            {#if canModerate && !p.isOwn}
              <DropdownMenu.Item
                variant="destructive"
                onSelect={() => {
                  openRequestDeletion(p.targetType, p.targetId);
                }}
              >
                <ShieldAlert class="size-4" />
                {m.discussion_post_request_deletion()}
              </DropdownMenu.Item>
            {/if}
            {#if p.isOwn}
              <DropdownMenu.Item
                variant="destructive"
                onSelect={() => {
                  openDelete(p.targetType, p.targetId);
                }}
              >
                <Trash2 class="size-4" />
                {m.discussion_post_delete()}
              </DropdownMenu.Item>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </div>
  </div>
{/snippet}

<!-- Public edit-history panel for a post (the "edited" dropdown), shown inline
     under the comment. Lazy-loaded into historyCache on first open. -->
{#snippet historyPanel(postId: string, kind: "discussion" | "reply", isOwn: boolean)}
  {@const editType = kind === "discussion" ? "discussion_edit" : "discussion_reply_edit"}
  <div class="border-foreground/15 bg-muted/20 border-t px-4 py-3">
    <p class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
      {m.discussion_edit_history_title()}
    </p>
    {#if historyLoading === postId}
      <p class="text-muted-foreground text-sm">{m.discussion_edit_history_loading()}</p>
    {:else if historyCache[postId] && historyCache[postId].length > 0}
      <ul class="flex flex-col gap-3">
        {#each historyCache[postId] as v (v.id)}
          {#if v.removed}
            <li
              class="border-foreground/10 text-muted-foreground border border-dashed px-3 py-2 text-xs"
            >
              {m.moderation_version_removed()}
            </li>
          {:else}
            <li class="border-foreground/10 border">
              <div
                class="text-muted-foreground border-foreground/10 bg-muted/30 flex items-center justify-between gap-2 border-b px-3 py-1 text-xs"
              >
                <span>{dateFormatter.format(new Date(v.editedAt))}</span>
                {#if signedIn}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      {#snippet child({ props })}
                        <button
                          {...props}
                          class="text-muted-foreground hover:text-foreground inline-flex size-6 shrink-0 items-center justify-center transition-colors"
                          aria-label={m.moderation_version_more()}
                          title={m.moderation_version_more()}
                        >
                          <Ellipsis class="size-3.5" />
                        </button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content
                      align="end"
                      class="min-w-44 whitespace-nowrap"
                      preventScroll={false}
                    >
                      {#if !isOwn}
                        <DropdownMenu.Item
                          onSelect={() => {
                            openReport(editType, v.id);
                          }}
                        >
                          <Flag class="size-4" />
                          {m.moderation_version_report()}
                        </DropdownMenu.Item>
                      {/if}
                      {#if !isOwn && (canModerate || isOwn)}
                        <DropdownMenu.Separator />
                      {/if}
                      {#if canModerate && !isOwn}
                        <DropdownMenu.Item
                          variant="destructive"
                          onSelect={() => {
                            openRequestDeletion(editType, v.id);
                          }}
                        >
                          <ShieldAlert class="size-4" />
                          {m.moderation_version_request_deletion()}
                        </DropdownMenu.Item>
                      {/if}
                      {#if isOwn}
                        <DropdownMenu.Item
                          variant="destructive"
                          onSelect={() => {
                            openDelete(editType, v.id);
                          }}
                        >
                          <Trash2 class="size-4" />
                          {m.moderation_version_delete()}
                        </DropdownMenu.Item>
                      {/if}
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                {/if}
              </div>
              <div class="prose prose-stone dark:prose-invert prose-sm max-w-none px-3 py-2">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side -->
                {@html v.bodyHtml}
              </div>
            </li>
          {/if}
        {/each}
      </ul>
    {:else}
      <p class="text-muted-foreground text-sm">{m.discussion_edit_history_empty()}</p>
    {/if}
  </div>
{/snippet}

<div class="mx-auto max-w-4xl px-6 pt-24 pb-16">
  <a
    href={localizeHref(discussionsBase)}
    class="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
  >
    <ArrowLeft class="size-4" />
    {m.discussion_thread_back()}
  </a>

  <!-- Thread header: title + bold status pill, with status-change controls
       (revealed for author / moderator) in a fixed-height cluster so the
       reveal doesn't shift the body below. -->
  <header class="mb-6">
    <h1 class="text-foreground text-3xl font-semibold tracking-tight text-balance">
      {thread.title}
    </h1>
    <!-- Status + pinned badge on the left, actions on the right; one row so
         everything shares a baseline and the same h-9 height. -->
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <StatusBadge status={thread.status} pill />
      {#if thread.isPinned}
        <span
          class="border-foreground/15 text-muted-foreground inline-flex h-9 items-center gap-1.5 border px-2.5 text-xs"
        >
          <Pin class="size-3.5" />
          {m.discussion_pinned_badge()}
        </span>
      {/if}
      <div class="ml-auto flex items-center gap-1.5">
        {#if canModerate}
          <form method="POST" action="?/setPinned" use:enhance>
            <input type="hidden" name="pinned" value={thread.isPinned ? "false" : "true"} />
            <Button type="submit" variant="ghost" size="sm" class="h-9 gap-1.5">
              {#if thread.isPinned}
                <PinOff class="size-4" />
                {m.discussion_action_unpin()}
              {:else}
                <Pin class="size-4" />
                {m.discussion_action_pin()}
              {/if}
            </Button>
          </form>
        {/if}
        {#if canManageOp}
          {#if thread.status === "open"}
            <form method="POST" action="?/setStatus" use:enhance>
              <input type="hidden" name="status" value="resolved" />
              <Button type="submit" variant="outline" size="sm" class="h-9">
                {m.discussion_action_resolve()}
              </Button>
            </form>
            <form method="POST" action="?/setStatus" use:enhance>
              <input type="hidden" name="status" value="closed" />
              <Button type="submit" variant="ghost" size="sm" class="h-9">
                {m.discussion_action_close()}
              </Button>
            </form>
          {:else}
            <form method="POST" action="?/setStatus" use:enhance>
              <input type="hidden" name="status" value="open" />
              <Button type="submit" variant="outline" size="sm" class="h-9">
                {m.discussion_action_reopen()}
              </Button>
            </form>
          {/if}
        {/if}
      </div>
    </div>
    {#if thread.answeredReplyId !== null}
      <a
        href={`#comment-${thread.answeredReplyId}`}
        class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline-offset-2 hover:underline"
      >
        <CircleCheck class="size-4" />
        {m.discussion_answered_label()} · {m.discussion_answered_jump()}
      </a>
    {/if}
  </header>

  <!-- Comment stack: the original post, then the flat reply timeline. Each is a
       contained, bordered comment card. -->
  <div class="flex flex-col gap-4">
    <!-- Original post -->
    <article id={`comment-${thread.op.id}`} class="border-foreground/15 scroll-mt-20 border">
      <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
      {@render postHeader({
        handle: thread.op.authorHandle,
        displayName: thread.op.authorDisplayName,
        createdAt: thread.op.createdAt,
        isEdited: thread.op.isEdited,
        isOpAuthor: true,
        targetType: "discussion",
        targetId: thread.op.id,
        isOwn: isMyOp,
        canEdit: isMyOp && !editingOp,
        permalink: `#comment-${thread.op.id}`,
        isAnswer: false,
        onEdit: () => (editingOp = true),
        onToggleHistory: () => void toggleHistory("discussion", thread.op.id),
      })}
      {#if editingOp}
        <form
          method="POST"
          action="?/editDiscussion"
          use:enhance={() => {
            return async ({ update, result }) => {
              await update({ reset: false });
              if (result.type === "success") editingOp = false;
            };
          }}
          class="flex flex-col gap-3 p-4"
        >
          <Input
            name="title"
            value={thread.title}
            maxlength={200}
            required
            aria-label={m.discussion_compose_title_label()}
            class="h-10"
          />
          <MarkdownEditor
            name="body"
            value={thread.op.bodySource}
            rows={8}
            ariaLabel={m.discussion_compose_body_label()}
            placeholder={m.discussion_compose_body_placeholder()}
          />
          <div class="flex flex-wrap items-center justify-between gap-3">
            <FormattingHint />
            <div class="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                class="h-10"
                onclick={() => (editingOp = false)}
              >
                {m.discussion_post_cancel()}
              </Button>
              <Button type="submit" class="h-10 px-5">{m.discussion_post_save()}</Button>
            </div>
          </div>
        </form>
      {:else}
        <div class="prose prose-stone dark:prose-invert max-w-none px-4 py-3">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- bodyHtml is sanitized server-side -->
          {@html thread.op.bodyHtml}
        </div>
      {/if}
      {#if historyOpenFor === thread.op.id}
        <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
        {@render historyPanel(thread.op.id, "discussion", isMyOp)}
      {/if}
    </article>

    <!-- Replies -->
    {#each thread.replies as reply (reply.id)}
      {#if reply.removed}
        <p
          class="border-foreground/15 text-muted-foreground border border-dashed px-4 py-3 text-sm"
        >
          {m.discussion_post_removed()}
        </p>
      {:else}
        <article
          id={`comment-${reply.id}`}
          class="border-foreground/15 scroll-mt-20 border {reply.isAnswer
            ? 'border-l-2 border-l-emerald-500'
            : ''}"
        >
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
          {@render postHeader({
            handle: reply.authorHandle,
            displayName: reply.authorDisplayName,
            createdAt: reply.createdAt,
            isEdited: reply.isEdited,
            isOpAuthor: reply.isOpAuthor,
            targetType: "discussion_reply",
            targetId: reply.id,
            isOwn: isMyReply(reply),
            canEdit: isMyReply(reply) && editingReplyId !== reply.id,
            permalink: `#comment-${reply.id}`,
            isAnswer: reply.isAnswer,
            canMarkAnswer: canManageOp,
            onMarkAnswer: () => {
              submitAnswerForm(reply.id);
            },
            onEdit: () => (editingReplyId = reply.id),
            onToggleHistory: () => void toggleHistory("reply", reply.id),
          })}
          {#if editingReplyId === reply.id}
            <form
              method="POST"
              action="?/editReply"
              use:enhance={() => {
                return async ({ update, result }) => {
                  await update({ reset: false });
                  if (result.type === "success") editingReplyId = null;
                };
              }}
              class="flex flex-col gap-3 p-4"
            >
              <input type="hidden" name="replyId" value={reply.id} />
              <MarkdownEditor
                name="body"
                value={reply.bodySource}
                rows={5}
                ariaLabel={m.discussion_thread_reply_heading()}
                placeholder={m.discussion_reply_placeholder()}
              />
              <div class="flex flex-wrap items-center justify-between gap-3">
                <FormattingHint />
                <div class="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-10"
                    onclick={() => (editingReplyId = null)}
                  >
                    {m.discussion_post_cancel()}
                  </Button>
                  <Button type="submit" class="h-10 px-5">{m.discussion_post_save()}</Button>
                </div>
              </div>
            </form>
          {:else}
            <div class="prose prose-stone dark:prose-invert prose-sm max-w-none px-4 py-3">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- bodyHtml is sanitized server-side -->
              {@html reply.bodyHtml}
            </div>
          {/if}
          {#if historyOpenFor === reply.id}
            <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
            {@render historyPanel(reply.id, "reply", isMyReply(reply))}
          {/if}
          <!-- Hidden form the "Mark as answer" menu item submits via
               requestSubmit(); empty replyId unmarks. -->
          <form
            id={`answer-${reply.id}`}
            method="POST"
            action="?/setAnswer"
            use:enhance
            class="hidden"
          >
            <input type="hidden" name="replyId" value={reply.isAnswer ? "" : reply.id} />
          </form>
        </article>
      {/if}
    {/each}
    {#if thread.repliesTruncated}
      <p class="text-muted-foreground py-2 text-center text-sm">
        {m.discussion_replies_truncated({ count: 200 })}
      </p>
    {/if}
  </div>

  <!-- Reply composer. Always in the static HTML; swaps to a sign-in CTA for
       anonymous readers once the session hydrates. -->
  <section class="mt-8">
    <h2 class="text-foreground mb-3 text-base font-medium">
      {m.discussion_thread_reply_heading()}
    </h2>
    <Composer
      action="?/reply"
      bodyPlaceholder={m.discussion_reply_placeholder()}
      submitLabel={m.discussion_reply_submit()}
      submittingLabel={m.discussion_reply_submitting()}
      signinLabel={m.discussion_reply_signin()}
      returnTo={threadPath}
      error={replyError}
      initialBody={field("action") === "reply" ? (field("body") ?? "") : ""}
    />
  </section>
</div>

<!-- Shared moderation dialogs: one instance each, retargeted by the kebab items. -->
<ReportDialog bind:open={reportOpen} target={reportTarget} />
<RequestDeletionDialog bind:open={requestDeletionOpen} target={requestDeletionTarget} />
<DeleteConfirm bind:open={deleteOpen} target={deleteTarget} />
