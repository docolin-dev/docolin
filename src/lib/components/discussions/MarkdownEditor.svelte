<script lang="ts">
  import { tick } from "svelte";
  import { m } from "$paraglide/messages";
  import Heading from "@lucide/svelte/icons/heading";
  import Bold from "@lucide/svelte/icons/bold";
  import Italic from "@lucide/svelte/icons/italic";
  import TextQuote from "@lucide/svelte/icons/text-quote";
  import Code from "@lucide/svelte/icons/code";
  import SquareCode from "@lucide/svelte/icons/square-code";
  import Link from "@lucide/svelte/icons/link";
  import List from "@lucide/svelte/icons/list";
  import ListOrdered from "@lucide/svelte/icons/list-ordered";
  import ListChecks from "@lucide/svelte/icons/list-checks";
  import Info from "@lucide/svelte/icons/info";
  import type { Component } from "svelte";
  import { renderMarkdownPreview } from "$lib/markdown-shared";

  // Markdown composer surface: Write / Preview tabs, a quick-format toolbar for
  // people who don't know markdown, and a live preview. The preview renders
  // client-side via the shared isomorphic config (no shiki shipped to the
  // browser), so it stays off the server (Run Lean) while matching the
  // published format. The toolbar acts on the textarea selection.
  interface Props {
    name: string;
    value?: string;
    placeholder: string;
    ariaLabel: string;
    rows?: number;
    maxlength?: number;
  }
  let {
    name,
    value = $bindable(""),
    placeholder,
    ariaLabel,
    rows = 6,
    maxlength,
  }: Props = $props();

  let textarea = $state<HTMLTextAreaElement | null>(null);
  let tab = $state<"write" | "preview">("write");

  // Preview renders client-side (renderMarkdownPreview lazy-loads shiki), so the
  // first open downloads the highlighter, hence the loading state. Re-renders
  // only when the preview tab is active and the text changed since last render.
  let previewHtml = $state("");
  let previewLoading = $state(false);
  let lastPreviewedText = "";
  $effect(() => {
    if (tab !== "preview") return;
    const text = value;
    if (text.trim().length === 0) {
      previewHtml = "";
      lastPreviewedText = "";
      return;
    }
    if (text === lastPreviewedText) return;
    previewLoading = true;
    // The editor drives discussion bodies, so the preview downgrades headings
    // exactly as the published discussion render does.
    void renderMarkdownPreview(text, { downgradeHeadings: true }).then((html) => {
      // Drop the result if the writer switched tabs or edited in the meantime.
      if (tab === "preview" && value === text) {
        previewHtml = html;
        lastPreviewedText = text;
      }
      previewLoading = false;
    });
  });

  // Wrap the selection with markers (bold, italic, inline code, link).
  async function surround(before: string, after: string, ph: string): Promise<void> {
    const el = textarea;
    if (el === null) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = value.slice(s, e) || ph;
    value = value.slice(0, s) + before + selected + after + value.slice(e);
    await tick();
    el.focus();
    el.setSelectionRange(s + before.length, s + before.length + selected.length);
  }

  // Prefix every line touched by the selection (headings, quotes, lists).
  async function linePrefix(prefix: string): Promise<void> {
    const el = textarea;
    if (el === null) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const region = value.slice(lineStart, e) || "";
    const replaced = region
      .split("\n")
      .map((line) => prefix + line)
      .join("\n");
    value = value.slice(0, lineStart) + replaced + value.slice(e);
    await tick();
    el.focus();
    el.setSelectionRange(lineStart + replaced.length, lineStart + replaced.length);
  }

  // Insert a fenced block (code, callout) on its own lines.
  async function insertBlock(open: string, close: string, ph: string): Promise<void> {
    const el = textarea;
    if (el === null) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = value.slice(s, e) || ph;
    const lead = s > 0 && value[s - 1] !== "\n" ? "\n" : "";
    const block = lead + open + selected + close;
    value = value.slice(0, s) + block + value.slice(e);
    await tick();
    el.focus();
    const cursor = s + lead.length + open.length;
    el.setSelectionRange(cursor, cursor + selected.length);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b") {
      e.preventDefault();
      void surround("**", "**", "bold");
    } else if (k === "i") {
      e.preventDefault();
      void surround("*", "*", "italic");
    } else if (k === "k") {
      e.preventDefault();
      void surround("[", "](url)", "text");
    }
  }
</script>

{#snippet toolButton(Icon: Component, label: string, onclick: () => void)}
  <button
    type="button"
    {onclick}
    tabindex={-1}
    aria-label={label}
    title={label}
    class="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center transition-colors"
  >
    <Icon class="size-4" />
  </button>
{/snippet}

{#snippet divider()}
  <span class="bg-foreground/10 mx-1 h-5 w-px" aria-hidden="true"></span>
{/snippet}

<div class="border-foreground/15 focus-within:border-ring border transition-colors">
  <!-- Tab + toolbar header -->
  <div class="border-foreground/15 flex flex-wrap items-center justify-between gap-y-1 border-b">
    <div class="flex items-center">
      <button
        type="button"
        onclick={() => (tab = "write")}
        tabindex={-1}
        class="border-b-2 px-3 py-1.5 text-sm transition-colors {tab === 'write'
          ? 'border-primary text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground border-transparent'}"
      >
        {m.discussion_editor_write()}
      </button>
      <button
        type="button"
        onclick={() => (tab = "preview")}
        tabindex={-1}
        class="border-b-2 px-3 py-1.5 text-sm transition-colors {tab === 'preview'
          ? 'border-primary text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground border-transparent'}"
      >
        {m.discussion_editor_preview()}
      </button>
    </div>

    {#if tab === "write"}
      <div class="flex flex-wrap items-center px-1">
        <!-- eslint-disable @typescript-eslint/no-confusing-void-expression -->
        {@render toolButton(Heading, m.discussion_editor_heading(), () => void linePrefix("### "))}
        {@render toolButton(
          Bold,
          m.discussion_editor_bold(),
          () => void surround("**", "**", "bold"),
        )}
        {@render toolButton(
          Italic,
          m.discussion_editor_italic(),
          () => void surround("*", "*", "italic"),
        )}
        {@render divider()}
        {@render toolButton(TextQuote, m.discussion_editor_quote(), () => void linePrefix("> "))}
        {@render toolButton(
          Code,
          m.discussion_editor_code(),
          () => void surround("`", "`", "code"),
        )}
        {@render toolButton(
          SquareCode,
          m.discussion_editor_code_block(),
          () => void insertBlock("```\n", "\n```\n", "code"),
        )}
        {@render toolButton(
          Link,
          m.discussion_editor_link(),
          () => void surround("[", "](url)", "text"),
        )}
        {@render divider()}
        {@render toolButton(List, m.discussion_editor_bulleted_list(), () => void linePrefix("- "))}
        {@render toolButton(
          ListOrdered,
          m.discussion_editor_numbered_list(),
          () => void linePrefix("1. "),
        )}
        {@render toolButton(
          ListChecks,
          m.discussion_editor_task_list(),
          () => void linePrefix("- [ ] "),
        )}
        {@render toolButton(
          Info,
          m.discussion_editor_callout(),
          () => void insertBlock("!!! info\n    ", "", "Note"),
        )}
        <!-- eslint-enable @typescript-eslint/no-confusing-void-expression -->
      </div>
    {/if}
  </div>

  <!-- Write area stays mounted (hidden on preview) so its value still submits
         and selection is preserved across tab switches. -->
  <textarea
    bind:this={textarea}
    bind:value
    {name}
    {placeholder}
    {rows}
    {maxlength}
    aria-label={ariaLabel}
    onkeydown={onKeydown}
    class:hidden={tab === "preview"}
    class="placeholder:text-muted-foreground min-h-32 w-full resize-y border-0 bg-transparent px-3 py-3 text-sm outline-none focus:border-0 focus:ring-0 focus:outline-none"
  ></textarea>

  {#if tab === "preview"}
    {#if previewLoading && previewHtml.length === 0}
      <p class="text-muted-foreground min-h-32 px-3 py-3 text-sm">
        {m.discussion_editor_preview_loading()}
      </p>
    {:else if previewHtml.length > 0}
      <div class="prose prose-stone dark:prose-invert prose-sm min-h-32 max-w-none px-3 py-3">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized in renderMarkdownPreview -->
        {@html previewHtml}
      </div>
    {:else}
      <p class="text-muted-foreground min-h-32 px-3 py-3 text-sm">
        {m.discussion_editor_preview_empty()}
      </p>
    {/if}
  {/if}
</div>
