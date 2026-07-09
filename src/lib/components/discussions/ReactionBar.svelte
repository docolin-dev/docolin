<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import SmilePlus from "@lucide/svelte/icons/smile-plus";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { REACTION_EMOJIS, REACTION_GLYPHS, type ReactionEmoji } from "$lib/reactions";

  // GitHub-style reaction row under a post: chips for emojis that have
  // reactions (count + your-state highlight), plus a picker for the full set.
  // Counts arrive in the cached page payload; "mine" hydrates per user. Both
  // forms post the same ?/react toggle; signed-out clicks land at signin.
  interface Props {
    counts: Partial<Record<ReactionEmoji, number>>;
    /** Emojis the viewer has toggled on on this target. */
    mine: ReadonlySet<string>;
    /** Empty for the original post, the reply id otherwise. */
    replyId?: string;
    /** Fired optimistically on submit so the parent can flip its own-state. */
    ontoggle: (emoji: ReactionEmoji) => void;
  }
  let { counts, mine, replyId = "", ontoggle }: Props = $props();

  const active = $derived(REACTION_EMOJIS.filter((emoji) => (counts[emoji] ?? 0) > 0));

  // The picker submits through this hidden field (menu items aren't submit
  // buttons); chips carry their emoji as the button value instead.
  let pickerForm = $state<HTMLFormElement | null>(null);
  let pickerEmoji = $state<ReactionEmoji | "">("");

  function pick(emoji: ReactionEmoji): void {
    pickerEmoji = emoji;
    // Wait a tick so the bound input carries the value before submitting.
    requestAnimationFrame(() => pickerForm?.requestSubmit());
  }

  function onEnhance({ formData }: { formData: FormData }) {
    const emoji = formData.get("emoji");
    if (typeof emoji === "string" && emoji.length > 0) ontoggle(emoji as ReactionEmoji);
    return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
    };
  }
</script>

<div class="flex flex-wrap items-center gap-1.5 px-4 pb-3">
  {#if active.length > 0}
    <form method="POST" action="?/react" use:enhance={onEnhance} class="contents">
      {#if replyId.length > 0}
        <input type="hidden" name="replyId" value={replyId} />
      {/if}
      {#each active as emoji (emoji)}
        <button
          type="submit"
          name="emoji"
          value={emoji}
          aria-pressed={mine.has(emoji)}
          aria-label={m.discussion_reaction_chip({ emoji, count: counts[emoji] ?? 0 })}
          class="inline-flex h-7 items-center gap-1 border px-2 text-xs transition-colors max-sm:h-9 {mine.has(
            emoji,
          )
            ? 'border-primary/40 bg-primary/10 text-foreground'
            : 'border-foreground/15 text-muted-foreground hover:border-foreground/30 hover:text-foreground'}"
        >
          <span aria-hidden="true">{REACTION_GLYPHS[emoji]}</span>
          <span class="tabular-nums">{counts[emoji]}</span>
        </button>
      {/each}
    </form>
  {/if}

  <form method="POST" action="?/react" use:enhance={onEnhance} bind:this={pickerForm}>
    {#if replyId.length > 0}
      <input type="hidden" name="replyId" value={replyId} />
    {/if}
    <input type="hidden" name="emoji" value={pickerEmoji} />
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={m.discussion_reaction_add()}
        title={m.discussion_reaction_add()}
        class="text-muted-foreground hover:border-foreground/30 hover:text-foreground border-foreground/15 inline-flex size-7 items-center justify-center border transition-colors max-sm:size-9"
      >
        <SmilePlus class="size-3.5" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <!-- w-auto overrides the component's anchor-width default; this anchor
           is the 28px picker button, which would crush the row to one emoji. -->
      <DropdownMenu.Content align="start" class="w-auto min-w-0" preventScroll={false}>
        <div class="flex gap-1 p-1">
          {#each REACTION_EMOJIS as emoji (emoji)}
            <DropdownMenu.Item
              onSelect={() => {
                pick(emoji);
              }}
              aria-label={emoji}
              class="size-8 cursor-pointer justify-center p-0 text-base max-sm:size-9 {mine.has(
                emoji,
              )
                ? 'bg-primary/10'
                : ''}"
            >
              {REACTION_GLYPHS[emoji]}
            </DropdownMenu.Item>
          {/each}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </form>
</div>
