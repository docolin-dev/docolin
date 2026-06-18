<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { getLocale } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import MaskedEmail from "$lib/components/MaskedEmail.svelte";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import AlertTriangle from "@lucide/svelte/icons/triangle-alert";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const claim = $derived(data.claim);
  const siblings = $derived(data.siblings);

  let approveNotes = $state("");
  let cancelNotes = $state("");
  let submitting = $state<null | "approve" | "cancel">(null);

  const dateFormatter = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }),
  );

  function formErrorMessage(error: unknown): string | null {
    if (typeof error !== "string") return null;
    if (error === "not_found") return m.admin_claim_error_not_found();
    if (error === "not_pending") return m.admin_claim_error_already_resolved();
    if (error === "slug_taken") return m.admin_claim_error_slug_taken();
    if (error === "provision_failed") return m.admin_claim_error_provision_failed();
    if (error === "notes_required") return m.admin_claim_error_notes_required();
    if (error === "forbidden") return m.admin_claim_error_forbidden();
    return null;
  }
</script>

<svelte:head>
  <title>{m.admin_claim_meta_title({ slug: claim.slug })} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-3xl">
  <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.22em] uppercase">
    {m.admin_claim_eyebrow()}
  </p>
  <h1 class="text-foreground text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
    {claim.slug}
    {#if claim.requestedDisplayName}
      <!-- The display name the requester typed on the create form. Shown
           inline so the admin sees what the org will actually be named on
           approval (vs the slug, which is just the URL segment). -->
      <span class="text-muted-foreground text-2xl font-normal sm:text-3xl">
        as "{claim.requestedDisplayName}"
      </span>
    {/if}
  </h1>
  <!-- Two-line compressed header beneath the slug. Sub-line 1: who, with
       sans-serif name + mono email so the domain reads at a glance against
       the slug above without needing a separate "REQUESTED BY" label.
       Sub-line 2: muted caption with filed-at + ref id. flex-wrap on each
       so long emails reflow cleanly on narrow widths. -->
  <p class="text-foreground/80 mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
    {#if claim.requester.deleted}
      <span class="text-muted-foreground italic">{m.common_deleted_account()}</span>
    {:else}
      <span>
        {claim.requester.displayName ?? claim.requester.handle}
        <span class="text-muted-foreground">(@{claim.requester.handle})</span>
      </span>
      {#if claim.requester.email}
        <span class="text-muted-foreground" aria-hidden="true">·</span>
        <MaskedEmail email={claim.requester.email} class="text-foreground font-mono" />
      {/if}
    {/if}
  </p>
  <p class="text-muted-foreground mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
    <span>
      {m.admin_claim_filed_caption({
        date: dateFormatter.format(new Date(claim.createdAt)),
      })}
    </span>
    <span aria-hidden="true">·</span>
    <span class="font-mono select-all">{claim.uid}</span>
  </p>

  <!-- User-provided context: full text from the claim form's details
       textarea. Empty placeholder so admins know the field was blank. -->
  <section class="mt-10">
    <h2 class="text-foreground text-lg font-medium tracking-tight">
      {m.admin_claim_details_label()}
    </h2>
    {#if claim.details}
      <p class="text-foreground/80 mt-3 leading-relaxed whitespace-pre-wrap">{claim.details}</p>
    {:else}
      <p class="text-muted-foreground mt-3 text-sm italic">{m.admin_claim_details_empty()}</p>
    {/if}
  </section>

  <!-- Sibling pending claims warning. Surfaced so the admin understands the
       cascade-cancel consequence of approving. -->
  {#if siblings.length > 0}
    <div class="border-primary/40 bg-primary/5 mt-8 flex items-start gap-3 border border-l-4 p-5">
      <AlertTriangle class="text-primary mt-0.5 size-5 shrink-0" />
      <div>
        <p class="text-foreground text-sm font-medium">
          {siblings.length === 1
            ? m.admin_claim_siblings_warning_one()
            : m.admin_claim_siblings_warning_many({ count: siblings.length.toString() })}
        </p>
        <ul class="text-muted-foreground mt-2 space-y-0.5 text-sm">
          {#each siblings as sib (sib.uid)}
            <li>
              {#if sib.deleted}
                <span class="italic">{m.common_deleted_account()}</span>
              {:else}
                <span class="text-foreground/80">@{sib.handle}</span>
                {#if sib.email}
                  <span aria-hidden="true">·</span>
                  <MaskedEmail email={sib.email} class="font-mono" />
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  {#if form?.error}
    {@const message = formErrorMessage(form.error)}
    {#if message}
      <p
        class="text-destructive border-destructive/30 bg-destructive/5 mt-8 border px-3 py-2 text-sm"
      >
        {message}
      </p>
    {/if}
  {/if}

  <!-- Approve form. Notes optional (audit trail only; nothing user-visible). -->
  <section class="mt-12">
    <h2 class="text-foreground text-xl font-semibold tracking-tight">
      {m.admin_claim_approve_heading()}
    </h2>
    <p class="text-foreground/80 mt-2 text-sm leading-relaxed">{m.admin_claim_approve_body()}</p>
    <form
      method="POST"
      action="?/approve"
      class="mt-6"
      use:enhance={() => {
        submitting = "approve";
        return ({ update }) => {
          void update().finally(() => {
            submitting = null;
          });
        };
      }}
    >
      <label for="approveNotes" class="text-foreground/80 mb-2 block text-sm font-medium">
        {m.admin_claim_approve_notes_label()}
      </label>
      <textarea
        id="approveNotes"
        name="notes"
        bind:value={approveNotes}
        rows="2"
        maxlength={1000}
        class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full appearance-none border px-3 py-2 text-sm shadow-none outline-none focus-visible:ring-4"
      ></textarea>
      <p class="text-muted-foreground mt-2 text-xs">{m.admin_claim_approve_notes_hint()}</p>
      <div class="mt-4">
        <Button
          type="submit"
          size="lg"
          disabled={submitting !== null}
          class="group h-11 gap-2 px-5 text-base"
        >
          <Check class="size-4" />
          {submitting === "approve"
            ? m.admin_claim_approve_submitting()
            : m.admin_claim_approve_cta()}
        </Button>
      </div>
    </form>
  </section>

  <!-- Cancel form. Notes required because the reason is sent to the user via
       inbox; an empty reason wastes their time. -->
  <section class="mt-12">
    <h2 class="text-foreground text-xl font-semibold tracking-tight">
      {m.admin_claim_cancel_heading()}
    </h2>
    <p class="text-foreground/80 mt-2 text-sm leading-relaxed">{m.admin_claim_cancel_body()}</p>
    <form
      method="POST"
      action="?/cancel"
      class="mt-6"
      use:enhance={() => {
        submitting = "cancel";
        return ({ update }) => {
          void update().finally(() => {
            submitting = null;
          });
        };
      }}
    >
      <label for="cancelNotes" class="text-foreground/80 mb-2 block text-sm font-medium">
        {m.admin_claim_cancel_notes_label()}
      </label>
      <textarea
        id="cancelNotes"
        name="notes"
        bind:value={cancelNotes}
        rows="3"
        maxlength={1000}
        required
        class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full appearance-none border px-3 py-2 text-sm shadow-none outline-none focus-visible:ring-4"
      ></textarea>
      <p class="text-muted-foreground mt-2 text-xs">{m.admin_claim_cancel_notes_hint()}</p>
      <div class="mt-4">
        <Button
          type="submit"
          variant="outline"
          size="lg"
          disabled={submitting !== null || cancelNotes.trim().length === 0}
          class="group h-11 gap-2 px-5 text-base"
        >
          <X class="size-4" />
          {submitting === "cancel" ? m.admin_claim_cancel_submitting() : m.admin_claim_cancel_cta()}
        </Button>
      </div>
    </form>
  </section>

  <div class="mt-16">
    <Button
      href={localizeHref("/dashboard/admin/claims")}
      variant="ghost"
      size="lg"
      class="group h-11 gap-2 px-3 text-base"
    >
      <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
      {m.admin_claim_back()}
    </Button>
  </div>
</div>
