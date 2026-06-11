<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import MarkdownEditor from "$lib/components/discussions/MarkdownEditor.svelte";
  import FormattingHint from "$lib/components/discussions/FormattingHint.svelte";
  import { session } from "$lib/client/session.svelte";
  import { LIMITS } from "$lib/limits";

  // Shared write surface for both the create-discussion page (with title) and
  // the reply box (body only). The signed-in form vs the anonymous sign-in CTA
  // swap client-side once the session store hydrates. Both placements sit at
  // the end of their container (nothing below to push), so the swap can't yank
  // the reader's eye and needs no height reservation. Submission is form-action
  // based, so it works without JS and gets SvelteKit's CSRF origin check free.
  interface Props {
    action: string;
    withTitle?: boolean;
    // When set, a visible label renders above the textarea. When omitted (e.g.
    // the reply box, which already sits under a heading) the label is dropped
    // but still applied as the textarea's accessible name.
    bodyLabel?: string;
    bodyPlaceholder: string;
    submitLabel: string;
    submittingLabel: string;
    signinLabel: string;
    returnTo: string;
    titleLabel?: string;
    titlePlaceholder?: string;
    error?: string | null;
    initialTitle?: string;
    initialBody?: string;
    oncancel?: () => void;
  }
  let {
    action,
    withTitle = false,
    bodyLabel,
    bodyPlaceholder,
    submitLabel,
    submittingLabel,
    signinLabel,
    returnTo,
    titleLabel,
    titlePlaceholder,
    error = null,
    initialTitle = "",
    initialBody = "",
    oncancel,
  }: Props = $props();

  let submitting = $state(false);
  // Controlled body so we can clear it on a successful reply (where the action
  // returns without a redirect) without form.reset() fighting the editor.
  // Captures only the initial prop value on purpose (untrack); later parent
  // updates shouldn't clobber what the user has typed.
  let bodyValue = $state(untrack(() => initialBody));
  const signinHref = $derived(localizeHref(`/signin?returnTo=${encodeURIComponent(returnTo)}`));
  // The counter only appears once the writer is within 10% of the body limit;
  // it sits in the footer row whose height is fixed by the buttons, so its
  // appearance cannot shift the layout.
  const showCounter = $derived(bodyValue.length >= LIMITS.discussionBody * 0.9);
</script>

<div>
  {#if !session.loaded}
    <!-- Brief hydration placeholder; nothing sits below so its size is free. -->
    <div class="bg-muted h-10 w-48 animate-pulse"></div>
  {:else if session.value.dbUser}
    <form
      method="POST"
      {action}
      use:enhance={() => {
        submitting = true;
        return async ({ update, result }) => {
          // Don't auto-reset (it would wipe the controlled editor); keep the
          // typed text on failure and clear the body only on a successful post
          // (a reply lands as success without a redirect).
          await update({ reset: false });
          if (result.type === "success") bodyValue = "";
          submitting = false;
        };
      }}
      class="flex flex-col gap-3"
    >
      {#if withTitle}
        <div class="flex flex-col gap-1.5">
          <label for="discussion-title" class="text-sm font-medium">
            {titleLabel}
            <span class="text-primary" aria-hidden="true">*</span>
          </label>
          <Input
            id="discussion-title"
            name="title"
            value={initialTitle}
            placeholder={titlePlaceholder}
            maxlength={LIMITS.discussionTitle}
            required
            class="h-10"
          />
        </div>
      {/if}
      <div class="flex flex-col gap-1.5">
        {#if bodyLabel}
          <span class="text-sm font-medium">{bodyLabel}</span>
        {/if}
        <MarkdownEditor
          name="body"
          bind:value={bodyValue}
          placeholder={bodyPlaceholder}
          ariaLabel={bodyLabel ?? bodyPlaceholder}
          rows={withTitle ? 8 : 5}
          maxlength={LIMITS.discussionBody}
        />
      </div>
      {#if error}
        <p class="text-destructive text-sm">{error}</p>
      {/if}
      <!-- Footer: formatting help on the left, actions on the right with the
           primary (the "next" action) rightmost. Wraps on narrow screens. -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <FormattingHint />
          {#if showCounter}
            <span class="text-muted-foreground text-xs" aria-live="polite">
              {m.discussion_composer_char_counter({
                used: bodyValue.length,
                max: LIMITS.discussionBody,
              })}
            </span>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          {#if oncancel}
            <Button type="button" variant="ghost" class="h-10" onclick={oncancel}>
              {m.discussion_post_cancel()}
            </Button>
          {/if}
          <Button type="submit" disabled={submitting} class="h-10 px-5">
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  {:else}
    <!-- Signing in is the primary action for a signed-out reader, so it reads
         as a filled CTA, not a muted link. -->
    <Button href={signinHref} class="h-10 px-5">{signinLabel}</Button>
  {/if}
</div>
