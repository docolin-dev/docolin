<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import Mail from "@lucide/svelte/icons/mail";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const claim = $derived(data.claim);

  // mailto: link with subject + body prefilled from i18n templates, then URL-
  // encoded. The user's mail client opens with everything filled in; they can
  // edit before sending. Without sending this email, nothing happens on our
  // side; the claim row sits idle until a domain-matched address writes in.
  // Context comes from the `details` they typed on the claim form; name from
  // their account displayName. Either falls back to a bracketed placeholder
  // so it's obvious what to fill in.
  const mailtoHref = $derived(() => {
    const detailsText = claim.details?.trim() ?? "";
    const context =
      detailsText.length > 0
        ? detailsText
        : m.dashboard_new_org_claim_filed_mail_context_placeholder();
    const displayName = page.data.dbUser?.displayName?.trim() ?? "";
    const name =
      displayName.length > 0
        ? displayName
        : m.dashboard_new_org_claim_filed_mail_name_placeholder();
    const subject = m.dashboard_new_org_claim_filed_mail_subject({
      slug: claim.slug,
      uid: claim.uid,
    });
    const body = m.dashboard_new_org_claim_filed_mail_body({
      slug: claim.slug,
      uid: claim.uid,
      context,
      name,
    });
    return `mailto:support@docolin.dev?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  let copied = $state(false);
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyUid(): Promise<void> {
    await navigator.clipboard.writeText(claim.uid);
    copied = true;
    if (copyResetTimer) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copied = false;
    }, 2000);
  }
</script>

<svelte:head>
  <title>{m.dashboard_new_org_claim_filed_eyebrow()}, docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-2xl">
  <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.22em] uppercase">
    {m.dashboard_new_org_claim_filed_eyebrow()}
  </p>
  <h1 class="text-foreground text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
    {m.dashboard_new_org_claim_filed_title({ slug: claim.slug })}
  </h1>
  <p class="text-foreground/80 mt-4 max-w-xl text-base leading-relaxed">
    {m.dashboard_new_org_claim_filed_body()}
  </p>

  <!-- Reference id block + inline copy button. UID is select-all so users can
       grab it manually too. -->
  <div class="border-primary/40 bg-muted mt-8 border border-l-4 p-6">
    <p class="text-muted-foreground mb-2 font-mono text-xs tracking-[0.18em] uppercase">
      {m.dashboard_new_org_claim_filed_uid_label()}
    </p>
    <div class="flex flex-wrap items-center justify-between gap-4">
      <p class="text-foreground font-mono text-2xl font-semibold tracking-tight select-all">
        {claim.uid}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="h-9 gap-1.5"
        onclick={copyUid}
        aria-live="polite"
      >
        {#if copied}
          <Check class="size-3.5" />
          {m.dashboard_new_org_claim_filed_copy_done()}
        {:else}
          <Copy class="size-3.5" />
          {m.dashboard_new_org_claim_filed_copy_default()}
        {/if}
      </Button>
    </div>
  </div>

  <!-- Primary CTA: open the user's mail client with everything prefilled.
       This is the only action that actually moves the claim forward, so it's
       given full visual weight. -->
  <div class="mt-8">
    <Button
      href={mailtoHref()}
      target="_blank"
      rel="noopener noreferrer"
      size="lg"
      class="group h-12 gap-2 px-5 text-base"
    >
      <Mail class="size-4" />
      {m.dashboard_new_org_claim_filed_mail_cta()}
    </Button>
    <p class="text-muted-foreground mt-3 text-sm leading-relaxed">
      {m.dashboard_new_org_claim_filed_mail_fallback()}
    </p>
  </div>

  <div class="mt-12">
    <Button
      href={localizeHref("/dashboard")}
      variant="ghost"
      size="lg"
      class="group h-11 gap-2 px-3 text-base"
    >
      <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
      {m.dashboard_new_org_claim_filed_back()}
    </Button>
  </div>
</div>
