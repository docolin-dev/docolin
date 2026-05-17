<script lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import Check from "@lucide/svelte/icons/check";

  // Shared big-mono path input for picking a handle or org slug.
  // Live availability check against `checkUrl` with debounced fetch +
  // per-session memoization. Parent owns wording (reasonToMessage + hints)
  // and binds `isAvailable` to drive submit state.

  interface CheckResultOk {
    ok: true;
  }
  interface CheckResultFail {
    ok: false;
    reason: string;
  }
  type CheckResult = CheckResultOk | CheckResultFail;

  let {
    value = $bindable(""),
    // eslint-disable-next-line no-useless-assignment -- $bindable default is required for the type to not be `boolean | undefined`, even though we reassign in effects below.
    isAvailable = $bindable(false),
    isChecking = $bindable(false),
    // eslint-disable-next-line no-useless-assignment -- ditto.
    lastReason = $bindable<string | null>(null),
    checkUrl,
    reasonToMessage,
    idleHint,
    checkingHint,
    availableHint,
    id = "handle",
    name = "handle",
    prefix = "docolin.dev/",
    placeholder = "yourhandle",
    maxlength = 30,
    required = true,
    ariaLabel = "Pick a handle",
    claimReasons = new Set<string>(),
  }: {
    value?: string;
    isAvailable?: boolean;
    isChecking?: boolean;
    lastReason?: string | null;
    checkUrl: string;
    reasonToMessage: (reason: string) => string;
    idleHint: string;
    checkingHint: string;
    availableHint: string;
    id?: string;
    name?: string;
    prefix?: string;
    placeholder?: string;
    maxlength?: number;
    required?: boolean;
    ariaLabel?: string;
    // Reasons that aren't errors: the consumer renders its own UI (e.g. the
    // claim explainer for reserved_prereserved). When the current reason is
    // in this set, the picker drops all error styling and the inline status
    // line stays silent so the consumer's message is the only voice.
    claimReasons?: ReadonlySet<string>;
  } = $props();

  // Per-session memoization. SvelteMap keeps the lint happy (no mutable Map)
  // and reactivity-aware for cache reads in the same render.
  const resultCache = new SvelteMap<string, CheckResult>();
  let checkResult = $state<CheckResult | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeController: AbortController | null = null;

  async function runCheck(input: string, controller: AbortController): Promise<void> {
    try {
      // checkUrl may already carry query params (e.g. ?org=...) so pick the
      // right separator before appending the handle param. Without this we'd
      // emit `?org=foo?h=bar` and the server's h param ends up empty.
      const sep = checkUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${checkUrl}${sep}h=${encodeURIComponent(input)}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted && res.ok) {
        const result = (await res.json()) as CheckResult;
        resultCache.set(input, result);
        checkResult = result;
      }
    } catch {
      // Aborts and network errors are non-fatal; the form action does the
      // final check anyway.
    } finally {
      if (!controller.signal.aborted) isChecking = false;
    }
  }

  $effect(() => {
    const v = value.trim().toLowerCase();

    if (debounceTimer) clearTimeout(debounceTimer);
    if (activeController) activeController.abort();

    if (v.length === 0) {
      checkResult = null;
      isChecking = false;
      return;
    }

    const cached = resultCache.get(v);
    if (cached) {
      checkResult = cached;
      isChecking = false;
      return;
    }

    // Reset checkResult so the watcher below correctly drops isAvailable to
    // false while the new fetch is in flight (otherwise a stale "true" from
    // the previous handle leaks into the parent's submit-enable state).
    checkResult = null;
    isChecking = true;
    debounceTimer = setTimeout(() => {
      const controller = new AbortController();
      activeController = controller;
      void runCheck(v, controller);
    }, 300);
  });

  // Single source of truth for isAvailable / lastReason: derived from
  // checkResult. Parent can $derive UI state from lastReason (e.g. claim
  // mode) without piggybacking on reasonToMessage's call site.
  $effect(() => {
    isAvailable = checkResult?.ok === true;
    if (checkResult === null) {
      lastReason = null;
    } else if (checkResult.ok) {
      lastReason = null;
    } else {
      lastReason = checkResult.reason;
    }
  });

  const isClaimEligible = $derived(
    checkResult?.ok === false && claimReasons.has(checkResult.reason),
  );
  const showStatusOk = $derived(!isChecking && checkResult?.ok === true);
  const showStatusError = $derived(!isChecking && checkResult?.ok === false && !isClaimEligible);
</script>

<div>
  <div
    class="border-foreground/15 focus-within:border-primary flex items-baseline border-b pb-3 transition-colors"
    class:border-destructive={showStatusError}
  >
    <span
      class="text-muted-foreground/60 font-mono text-xl tracking-tight whitespace-nowrap sm:text-2xl"
    >
      {prefix}</span
    ><input
      {id}
      {name}
      type="text"
      bind:value
      {placeholder}
      autocomplete="off"
      spellcheck="false"
      {maxlength}
      {required}
      aria-label={ariaLabel}
      class="placeholder:text-foreground/25 text-foreground min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 font-mono text-xl tracking-tight shadow-none outline-none focus:ring-0 focus:outline-none sm:text-2xl"
    />
  </div>

  {#if !isClaimEligible}
    <!-- Status row is suppressed entirely when claim-eligible: the consumer
         renders its own claim explainer beneath, so this would just be empty
         space pushing the explainer further from the input. min-h reserved
         in all other states so typing doesn't shift layout. -->
    <p
      class="mt-4 flex min-h-[1.25rem] items-center gap-1.5 font-mono text-xs"
      class:text-muted-foreground={!showStatusOk && !showStatusError}
      class:text-primary={showStatusOk}
      class:text-destructive={showStatusError}
    >
      {#if isChecking}
        {checkingHint}
      {:else if showStatusOk}
        <Check class="size-3.5" />
        {availableHint}
      {:else if showStatusError && checkResult?.ok === false}
        {reasonToMessage(checkResult.reason)}
      {:else}
        {idleHint}
      {/if}
    </p>
  {/if}
</div>
