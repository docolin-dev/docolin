<script lang="ts">
  // The live form inside a docomd `!!! inputs` card, mounted by vars-impl.ts
  // over the server-rendered fallback. All cards on a page share one VarsStore,
  // so typing here updates every `{{ }}` chip, table, and chart in the doco.
  // Secret fields are password-masked with a reveal toggle and never persist;
  // validation runs on blur with space reserved (no layout shift).
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { slide } from "svelte/transition";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$paraglide/messages";
  import { SvelteSet } from "svelte/reactivity";
  import {
    validateInputValue,
    type VarDeclaration,
    type InputDeclaration,
    type InputProblem,
  } from "$lib/markdown/inputs";
  import type { VarsStore } from "$lib/markdown/vars-store.svelte";

  interface Props {
    store: VarsStore;
    /** This card's declarations (the store may span several cards). */
    declarations: VarDeclaration[];
    /** Author mistakes from parsing, surfaced so they get fixed. */
    problems: string[];
  }
  let { store, declarations, problems }: Props = $props();

  const inputs = $derived(
    declarations.filter((decl): decl is InputDeclaration => decl.kind === "input"),
  );
  const computed = $derived(declarations.filter((decl) => decl.kind === "computed"));

  const revealed = new SvelteSet<string>();
  const touched = new SvelteSet<string>();
  let derivedOpen = $state(false);

  function fieldType(decl: InputDeclaration): string {
    if (decl.secret) return revealed.has(decl.name) ? "text" : "password";
    return decl.type === "number" ? "number" : "text";
  }

  const MESSAGES: Record<InputProblem, (decl: InputDeclaration) => string> = {
    number: () => m.doco_inputs_error_number(),
    min: (decl) => m.doco_inputs_error_min({ min: String(decl.min ?? "") }),
    max: (decl) => m.doco_inputs_error_max({ max: String(decl.max ?? "") }),
    maxlen: (decl) => m.doco_inputs_error_maxlen({ maxlen: String(decl.maxlen ?? "") }),
    url: () => m.doco_inputs_error_url(),
    hostname: () => m.doco_inputs_error_hostname(),
  };

  function message(decl: InputDeclaration): string {
    if (!touched.has(decl.name)) return "";
    const code = validateInputValue(decl, store.inputValues[decl.name] ?? "");
    return code === null ? "" : MESSAGES[code](decl);
  }

  function derivedDisplay(name: string): string {
    const { values, tainted, errors } = store.resolved;
    if (name in errors) return errors[name];
    if (tainted.has(name)) return "...";
    return name in values ? String(values[name]) : "...";
  }
</script>

<div class="flex flex-col gap-4 px-4 py-4">
  <div class="grid gap-4 sm:grid-cols-2">
    {#each inputs as decl (decl.name)}
      <div class="flex flex-col gap-1.5">
        <Label for={`doco-input-${decl.name}`}>{decl.label}</Label>
        <div class="flex items-center gap-2">
          <Input
            id={`doco-input-${decl.name}`}
            type={fieldType(decl)}
            placeholder={decl.placeholder ?? undefined}
            value={store.inputValues[decl.name] ?? ""}
            oninput={(event: Event & { currentTarget: EventTarget & HTMLInputElement }) => {
              store.setValue(decl.name, event.currentTarget.value);
            }}
            onblur={() => {
              touched.add(decl.name);
            }}
            class="flex-1"
          />
          {#if decl.secret}
            <Button
              variant="ghost"
              size="icon"
              onclick={() => {
                if (revealed.has(decl.name)) revealed.delete(decl.name);
                else revealed.add(decl.name);
              }}
              aria-pressed={revealed.has(decl.name)}
              aria-label={revealed.has(decl.name) ? m.doco_inputs_hide() : m.doco_inputs_reveal()}
              title={revealed.has(decl.name) ? m.doco_inputs_hide() : m.doco_inputs_reveal()}
            >
              {#if revealed.has(decl.name)}<EyeOff class="size-4" />{:else}<Eye
                  class="size-4"
                />{/if}
            </Button>
          {/if}
        </div>
        <p class="text-destructive min-h-4 text-xs">{message(decl)}</p>
        {#if decl.secret}
          <p class="text-muted-foreground -mt-1 text-xs">{m.doco_inputs_secret_hint()}</p>
        {/if}
      </div>
    {/each}
  </div>

  <div class="flex items-center justify-between gap-4">
    {#if computed.length > 0}
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors select-none"
        onclick={() => (derivedOpen = !derivedOpen)}
        aria-expanded={derivedOpen}
      >
        <ChevronRight
          class={`size-3.5 transition-transform duration-200 ${derivedOpen ? "rotate-90" : ""}`}
        />
        {m.doco_inputs_derived()}
      </button>
    {:else}
      <div></div>
    {/if}
    <Button
      variant="ghost"
      size="sm"
      onclick={() => {
        store.reset();
      }}
      disabled={!store.hasValues}
    >
      <RotateCcw class="size-4" />
      {m.doco_inputs_reset()}
    </Button>
  </div>

  {#if derivedOpen && computed.length > 0}
    <dl
      transition:slide={{ duration: 200 }}
      class="border-border grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-3 font-mono text-xs"
    >
      {#each computed as decl (decl.name)}
        <dt class="text-muted-foreground">{decl.name}</dt>
        <dd
          class={`truncate ${decl.name in store.resolved.errors ? "text-destructive" : "text-foreground"}`}
        >
          {derivedDisplay(decl.name)}
        </dd>
      {/each}
    </dl>
  {/if}

  {#if problems.length > 0}
    <ul class="text-destructive border-destructive/30 border-t pt-2 text-xs">
      {#each problems as problem, index (index)}
        <li>{problem}</li>
      {/each}
    </ul>
  {/if}
</div>
