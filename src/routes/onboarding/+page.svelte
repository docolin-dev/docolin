<script lang="ts">
  import { enhance } from "$app/forms";
  import { SvelteMap } from "svelte/reactivity";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Check from "@lucide/svelte/icons/check";
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
  let checking = $state(false);

  type CheckResult = { ok: true } | { ok: false; reason: string };
  let checkResult = $state<CheckResult | null>(null);

  // Per-session memoization so backtracking ("type bob, delete, retype bob")
  // doesn't refetch. Cache lives only in the component instance, so a page
  // reload starts fresh. No server-side cache for now: a single indexed
  // SELECT is cheap and the form action is the final source of truth.
  const resultCache = new SvelteMap<string, CheckResult>();

  // Debounced availability check that hits the handle-check endpoint as the
  // user types. AbortController cancels in-flight requests when the handle
  // changes so we don't show stale status against a newer input.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeController: AbortController | null = null;

  async function runCheck(value: string, controller: AbortController): Promise<void> {
    try {
      const res = await fetch(`/api/handle-check?h=${encodeURIComponent(value)}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted && res.ok) {
        const result = (await res.json()) as CheckResult;
        resultCache.set(value, result);
        checkResult = result;
      }
    } catch {
      // Aborts and network errors are non-fatal; the form action is the
      // final word on whether the handle is acceptable.
    } finally {
      if (!controller.signal.aborted) checking = false;
    }
  }

  $effect(() => {
    const value = handle.trim().toLowerCase();

    if (debounceTimer) clearTimeout(debounceTimer);
    if (activeController) activeController.abort();

    if (value.length === 0) {
      checkResult = null;
      checking = false;
      return;
    }

    const cached = resultCache.get(value);
    if (cached) {
      checkResult = cached;
      checking = false;
      return;
    }

    checking = true;
    debounceTimer = setTimeout(() => {
      const controller = new AbortController();
      activeController = controller;
      void runCheck(value, controller);
    }, 300);
  });

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

  const canSubmit = $derived(!submitting && !checking && checkResult?.ok === true);
  const showStatusError = $derived(!checking && checkResult?.ok === false);
  const showStatusOk = $derived(!checking && checkResult?.ok === true);

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
        href="/signout"
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
        <!-- The path display IS the input. docolin.dev/ prefix is muted; the
             handle the user types renders in the same large monospace face,
             so the whole row reads as "your future docolin identity, live". -->
        <label
          for="handle"
          class="text-foreground/55 mb-3 block font-mono text-[10px] tracking-[0.22em] uppercase"
        >
          {m.onboarding_handle_label()}
        </label>
        <div
          class="border-foreground/15 focus-within:border-primary flex items-baseline border-b pb-3 transition-colors"
          class:border-destructive={showStatusError}
        >
          <span
            class="text-muted-foreground/60 font-mono text-xl tracking-tight whitespace-nowrap sm:text-2xl"
          >
            {m.onboarding_handle_prefix()}</span
          ><input
            id="handle"
            name="handle"
            type="text"
            bind:value={handle}
            placeholder={m.onboarding_handle_placeholder()}
            autocomplete="off"
            spellcheck="false"
            maxlength={30}
            required
            class="placeholder:text-foreground/25 text-foreground min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 font-mono text-xl tracking-tight shadow-none outline-none focus:ring-0 focus:outline-none sm:text-2xl"
          />
        </div>

        <!-- Status row: reserves min-height so the layout doesn't jump as
             status text appears. -->
        <p
          class="mt-4 flex min-h-[1.25rem] items-center gap-1.5 font-mono text-xs"
          class:text-muted-foreground={!showStatusOk && !showStatusError}
          class:text-primary={showStatusOk}
          class:text-destructive={showStatusError}
        >
          {#if checking}
            {m.onboarding_handle_hint_checking()}
          {:else if showStatusOk}
            <Check class="size-3.5" />
            {m.onboarding_handle_hint_available()}
          {:else if showStatusError && checkResult?.ok === false}
            {reasonToMessage(checkResult.reason)}
          {:else}
            {m.onboarding_handle_hint_idle()}
          {/if}
        </p>

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
              maxlength={64}
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
