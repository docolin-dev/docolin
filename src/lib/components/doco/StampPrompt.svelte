<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import PawPrint from "@lucide/svelte/icons/paw-print";
  import Check from "@lucide/svelte/icons/check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import X from "@lucide/svelte/icons/x";

  // End-of-article stamp prompt: the action surface on every breakpoint, and the
  // Pango Score's home on small screens where the desktop rail is hidden. Kept a
  // light, low-chrome section (a top rule, not a bordered card) so it does not
  // read as a second CTA competing with the Discussions card below it. One tap
  // per outcome, submitted through the `stamp` form action so it works sans JS.
  // The chosen outcome stays filled as the confirmation; there is no text message.
  let {
    versionId,
    score,
    signedIn,
    preview = false,
  }: {
    versionId: string;
    score: number | null;
    signedIn: boolean;
    // Local-folder preview: the doco isn't published, so verification can't
    // record. Show the prompt one-to-one but disabled, with a note.
    preview?: boolean;
  } = $props();

  let submitting = $state(false);
  let chosen = $state<string | null>(null);
  let alreadyStamped = $state(false);
  let errored = $state(false);

  const STORAGE_PREFIX = "docolin:stamp:";

  function readStamp(id: string): string | null {
    try {
      return localStorage.getItem(STORAGE_PREFIX + id);
    } catch {
      // Storage can throw when disabled (private mode, blocked cookies). No local
      // memory then, which is fine: the stamp still records server-side.
      return null;
    }
  }
  function writeStamp(id: string, outcome: string): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + id, outcome);
    } catch {
      // Storage disabled; skip the local memory, the stamp recorded regardless.
    }
  }

  // Reflect a prior stamp from this browser. Cache-friendly: the page HTML is
  // shared across readers, so "did I stamp this?" lives client-side, not in the
  // cached shell. Re-runs on version change so navigation resets it. UX only, not
  // a security control: the server keeps only a signed-in voter's latest stamp
  // per version, so the score can't be inflated by re-tapping.
  $effect(() => {
    const prior = readStamp(versionId);
    chosen = prior;
    alreadyStamped = prior !== null;
    errored = false;
  });

  const submit: SubmitFunction = ({ formData }) => {
    submitting = true;
    errored = false;
    const outcome = formData.get("outcome");
    chosen = typeof outcome === "string" ? outcome : null;
    return ({ result }) => {
      submitting = false;
      if (result.type === "success" && chosen !== null) {
        writeStamp(versionId, chosen);
        alreadyStamped = true;
      } else {
        errored = true;
      }
    };
  };

  // Hover lives in its own class so it never overrides the filled/selected state
  // (the bug where hovering an already-chosen button washed out its primary fill).
  const BASE =
    "text-foreground inline-flex h-10 cursor-pointer items-center gap-2 border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const IDLE = "border-foreground/15 hover:border-foreground/40 hover:bg-background";
  const SELECTED = "border-primary bg-primary text-primary-foreground hover:bg-primary/90";

  function buttonClass(value: string): string {
    if (chosen === value && alreadyStamped) return `${BASE} ${SELECTED}`;
    if (chosen === value) return `${BASE} border-primary hover:bg-background`;
    return `${BASE} ${IDLE}`;
  }
</script>

<section id="stamp-prompt" class="border-foreground/10 mt-8 border-t pt-6">
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
    <h3 class="text-foreground text-base font-medium">{m.doco_stamp_question()}</h3>
    <p class="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
      <PawPrint class="size-3.5" />
      {#if score !== null}
        {m.doco_pango_score_label()}
        <span class="text-foreground tabular-nums">{score}</span>
      {:else}
        {m.doco_pango_score_unrated()}
      {/if}
    </p>
  </div>

  <!-- In preview the wrapping div carries the tooltip: a disabled <button>
       doesn't fire hover events, so a title on it wouldn't show. -->
  <div title={preview ? m.preview_action_disabled() : undefined}>
    <form method="POST" action="?/stamp" use:enhance={submit} class="mt-3 flex flex-wrap gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <button
        type="submit"
        name="outcome"
        value="worked"
        disabled={submitting || preview}
        class={buttonClass("worked")}
      >
        <Check class="size-4" />
        {m.doco_stamp_worked()}
      </button>
      <button
        type="submit"
        name="outcome"
        value="worked_with_caveats"
        disabled={submitting || preview}
        class={buttonClass("worked_with_caveats")}
      >
        <CircleAlert class="size-4" />
        {m.doco_stamp_caveats()}
      </button>
      <button
        type="submit"
        name="outcome"
        value="didnt_work"
        disabled={submitting || preview}
        class={buttonClass("didnt_work")}
      >
        <X class="size-4" />
        {m.doco_stamp_didnt_work()}
      </button>
    </form>
  </div>

  <!-- Only an error (rare) or the anonymous sign-in nudge surface here; the
       chosen-button fill is the confirmation, so there is no success message. -->
  <div class="mt-2 text-xs empty:hidden" aria-live="polite">
    {#if preview}
      <span class="text-muted-foreground">{m.preview_verify_note()}</span>
    {:else if errored}
      <span class="text-destructive">{m.doco_stamp_error()}</span>
    {:else if !signedIn}
      <a
        href={localizeHref("/signin")}
        class="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      >
        {m.doco_stamp_signin_nudge()}
      </a>
    {/if}
  </div>
</section>
