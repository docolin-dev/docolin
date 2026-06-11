<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { LIMITS } from "$lib/limits";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import HandlePicker from "$lib/components/HandlePicker.svelte";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  // SvelteKit's ActionData type union confuses eslint's inference into
  // typing form.handle / form.displayName as `error`. Routing the read
  // through `unknown` lets us safely narrow with typeof.
  function initialHandle(): string {
    const formHandle: unknown = form?.handle;
    if (typeof formHandle === "string") return formHandle;
    return data.suggestedHandle;
  }
  function initialDisplayName(): string {
    const formDisplayName: unknown = form?.displayName;
    if (typeof formDisplayName === "string") return formDisplayName;
    return data.suggestedDisplayName;
  }

  let handle = $state(initialHandle());
  let displayName = $state(initialDisplayName());
  let submitting = $state(false);
  let isHandleAvailable = $state(false);
  let isHandleChecking = $state(false);

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
        return m.onboarding_handle_hint_idle();
    }
  }

  const canSubmit = $derived(!submitting && !isHandleChecking && isHandleAvailable);

  const firstNameForGreeting = $derived(data.suggestedDisplayName.split(" ")[0]);
</script>

<svelte:head>
  <title>{m.onboarding_meta_title()}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="bg-background text-foreground flex min-h-screen flex-col">
  <!-- Minimal chrome: brand mark on the left so the visitor knows where they
       are, language switcher + sign-out escape hatch on the right. No nav,
       no footer. -->
  <div class="flex items-center justify-between gap-4 px-6 py-5 sm:px-8">
    <a href={localizeHref("/")} class="text-base font-semibold tracking-tight whitespace-nowrap">
      docolin
    </a>
    <div class="flex items-center gap-3">
      <LanguageSwitcher />
      <a
        href={localizeHref("/signout")}
        class="text-muted-foreground hover:text-foreground font-mono text-xs tracking-tight transition-colors"
      >
        {m.nav_sign_out()}
      </a>
    </div>
  </div>

  <main class="flex flex-1 items-center justify-center px-6 py-12">
    <div class="w-full max-w-2xl">
      <p
        class="text-muted-foreground mb-10 text-center font-mono text-xs tracking-[0.22em] uppercase"
      >
        {m.onboarding_welcome_greeting()}{firstNameForGreeting ? `, ${firstNameForGreeting}` : ""}
      </p>

      <form
        method="POST"
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
          for="handle"
          class="text-foreground/55 mb-3 block font-mono text-[10px] tracking-[0.22em] uppercase"
        >
          {m.onboarding_handle_label()}
        </label>
        <HandlePicker
          bind:value={handle}
          bind:isAvailable={isHandleAvailable}
          bind:isChecking={isHandleChecking}
          checkUrl="/api/handle-check"
          {reasonToMessage}
          idleHint={m.onboarding_handle_hint_idle()}
          checkingHint={m.onboarding_handle_hint_checking()}
          availableHint={m.onboarding_handle_hint_available()}
          placeholder={m.onboarding_handle_placeholder()}
          prefix={m.onboarding_handle_prefix()}
          ariaLabel={m.onboarding_handle_label()}
        />

        <div class="mt-12 space-y-5">
          <div>
            <label for="displayName" class="text-foreground/80 mb-2 block text-sm font-medium">
              {m.onboarding_displayname_label()}
            </label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              bind:value={displayName}
              maxlength={LIMITS.displayName}
              class="h-11"
            />
            <p class="text-muted-foreground mt-2 text-xs">
              {m.onboarding_displayname_hint()}
            </p>
          </div>

          {#if form?.error && (form.error === "not_authenticated" || form.error === "provision_failed")}
            <p
              class="text-destructive border-destructive/30 bg-destructive/5 border px-3 py-2 text-sm"
            >
              {form.error === "not_authenticated"
                ? m.onboarding_error_not_authenticated()
                : m.onboarding_error_provision_failed()}
            </p>
          {/if}

          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit}
            class="group h-12 w-full gap-2 text-base"
          >
            {submitting ? m.onboarding_submit_loading() : m.onboarding_submit_button()}
            {#if !submitting}
              <ArrowRight class="size-4 transition-transform group-hover:translate-x-1" />
            {/if}
          </Button>
        </div>
      </form>
    </div>
  </main>
</div>
