<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import HandlePicker from "$lib/components/HandlePicker.svelte";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import type { PageProps } from "./$types";

  let { form }: PageProps = $props();

  // Form errors: surface unknown / taken / server failures with a friendly
  // line. Specific i18n key per error reason.
  function formErrorMessage(error: unknown): string | null {
    if (typeof error !== "string") return null;
    if (error === "provision_failed") return m.dashboard_new_org_error_provision_failed();
    if (error === "claim_failed") return m.dashboard_new_org_error_claim_failed();
    if (error === "taken") return m.onboarding_handle_status_taken();
    if (error === "not_authenticated") return m.onboarding_error_not_authenticated();
    return null;
  }

  // Same unknown-narrowing trick as onboarding: ActionData's union confuses
  // eslint inference. Route reads through unknown so typeof narrows safely.
  function initialField(field: string): string {
    if (!form) return "";
    const value: unknown = (form as Record<string, unknown>)[field];
    if (typeof value === "string") return value;
    return "";
  }

  let slug = $state(initialField("handle"));
  let displayName = $state(initialField("displayName"));
  let claimDetails = $state(initialField("details"));
  let submitting = $state(false);
  let isAvailable = $state<boolean>(false);
  let isChecking = $state<boolean>(false);
  let lastReason = $state<string | null>(null);

  // Pre-reserved slug switches the form into claim mode: same fields plus an
  // optional details textarea, primary CTA changes label, server creates a
  // claim_request instead of an org.
  const isPreReserved = $derived(lastReason === "reserved_prereserved");

  // Submit is allowed when the slug is fully available OR when it's
  // pre-reserved and the user is choosing the claim path.
  const canSubmit = $derived(!submitting && !isChecking && (isAvailable || isPreReserved));

  // Pure translation function. HandlePicker owns lastReason via bindable;
  // this stays a side-effect-free i18n lookup.
  function reasonToMessage(reason: string): string {
    switch (reason) {
      case "too_short":
        return m.onboarding_handle_status_too_short();
      case "too_long":
        return m.onboarding_handle_status_too_long();
      case "invalid_format":
        return m.onboarding_handle_status_invalid_format();
      case "pure_numeric":
        return m.onboarding_handle_status_pure_numeric();
      case "v_numeric":
        return m.onboarding_handle_status_v_numeric();
      case "reserved_taxonomy":
        return m.onboarding_handle_status_reserved_taxonomy();
      case "reserved_system":
        return m.onboarding_handle_status_reserved_system();
      case "reserved_prereserved":
        return m.onboarding_handle_status_reserved_prereserved();
      case "matches_prefix":
        return m.onboarding_handle_status_matches_prefix();
      case "matches_suffix":
        return m.onboarding_handle_status_matches_suffix();
      case "taken":
        return m.onboarding_handle_status_taken();
      default:
        return m.dashboard_new_org_handle_hint_idle();
    }
  }
</script>

<svelte:head>
  <title>{m.dashboard_new_org_meta_title()}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-2xl">
  <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.22em] uppercase">
    {m.dashboard_new_org_eyebrow()}
  </p>
  <h1 class="text-foreground text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
    {m.dashboard_new_org_title()}
  </h1>
  <p class="text-foreground/80 mt-4 max-w-xl text-base leading-relaxed">
    {m.dashboard_new_org_subtitle()}
  </p>

  <form
    method="POST"
    class="mt-10"
    use:enhance={() => {
      submitting = true;
      return ({ update }) => {
        void update().finally(() => {
          submitting = false;
        });
      };
    }}
  >
    <label
      for="orgSlug"
      class="text-foreground/55 mb-3 block font-mono text-[10px] tracking-[0.22em] uppercase"
    >
      {m.dashboard_new_org_slug_label()}
    </label>
    <HandlePicker
      bind:value={slug}
      bind:isAvailable
      bind:isChecking
      bind:lastReason
      id="orgSlug"
      name="handle"
      checkUrl="/api/org-slug-check"
      {reasonToMessage}
      idleHint={m.dashboard_new_org_handle_hint_idle()}
      checkingHint={m.dashboard_new_org_handle_hint_checking()}
      availableHint={m.dashboard_new_org_handle_hint_available()}
      placeholder="yourbrand"
      ariaLabel={m.dashboard_new_org_slug_label()}
      claimReasons={new Set(["reserved_prereserved"])}
    />

    <!-- Claim mode: extra explainer + optional details field. Appears only
           when the slug check resolved as reserved_prereserved. -->
    {#if isPreReserved}
      <div class="border-primary/30 bg-primary/5 mt-8 border border-l-4 p-5">
        <p class="text-foreground text-base font-medium">
          {m.dashboard_new_org_claim_explainer_title()}
        </p>
        <p class="text-foreground/80 mt-2 text-sm leading-relaxed">
          {m.dashboard_new_org_claim_explainer_body()}
        </p>
      </div>

      <div class="mt-6">
        <label for="details" class="text-foreground/80 mb-2 block text-sm font-medium">
          {m.dashboard_new_org_claim_details_label()}
        </label>
        <textarea
          id="details"
          name="details"
          bind:value={claimDetails}
          rows="3"
          maxlength={1000}
          class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full appearance-none border px-3 py-2 text-sm shadow-none outline-none focus-visible:ring-4"
        ></textarea>
        <p class="text-muted-foreground mt-2 text-xs">
          {m.dashboard_new_org_claim_details_hint()}
        </p>
      </div>
    {/if}

    <div class="mt-8 space-y-5">
      <div>
        <label for="displayName" class="text-foreground/80 mb-2 block text-sm font-medium">
          {m.dashboard_new_org_displayname_label()}
        </label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          bind:value={displayName}
          maxlength={64}
          class="h-11"
        />
        <p class="text-muted-foreground mt-2 text-xs">
          {m.dashboard_new_org_displayname_hint()}
        </p>
      </div>

      {#if form?.error}
        {@const message = formErrorMessage(form.error)}
        {#if message}
          <p
            class="text-destructive border-destructive/30 bg-destructive/5 border px-3 py-2 text-sm"
          >
            {message}
          </p>
        {/if}
      {/if}

      <div class="flex items-center gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          class="group h-11 flex-1 gap-2 px-5 text-base"
        >
          {#if submitting}
            {isPreReserved
              ? m.dashboard_new_org_claim_submitting()
              : m.dashboard_new_org_submit_creating()}
          {:else}
            {isPreReserved ? m.dashboard_new_org_claim_submit() : m.dashboard_new_org_submit()}
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
          {/if}
        </Button>
        <Button
          href={localizeHref("/dashboard")}
          variant="ghost"
          size="lg"
          class="h-11 px-5 text-base"
        >
          {m.dashboard_new_org_cancel()}
        </Button>
      </div>
    </div>
  </form>
</div>
