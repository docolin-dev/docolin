<script lang="ts">
  import { m } from "$paraglide/messages";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import { toast } from "svelte-sonner";
  import type { ImportedDocoError } from "$lib/preview/import-project";

  // Hard validation errors (the doco wouldn't sync). Replaces the article with a
  // clear explanation, all errors at once, and a button that copies an AI-ready
  // fix prompt. Reused on the render page (one doco) and the overview (project
  // wide), so it always takes a list.
  let { errors }: { errors: ImportedDocoError[] } = $props();

  interface Issue {
    path: string;
    message: string;
  }
  function issuesOf(details: Record<string, unknown>): Issue[] {
    const raw = details.issues;
    if (!Array.isArray(raw)) return [];
    const out: Issue[] = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const o = item as Record<string, unknown>;
      out.push({
        path: typeof o.path === "string" ? o.path : "",
        message: typeof o.message === "string" ? o.message : "",
      });
    }
    return out;
  }

  function buildPrompt(): string {
    const lines: string[] = [
      "Fix these docolin doco validation errors so the file(s) will publish. Edit the YAML frontmatter to match docolin's schema (a `title`, an `authors` list with at least one entry, and a `docolin:` block with `schema_version`, `kind`, and `type`).",
      "",
    ];
    for (const e of errors) {
      lines.push(`File: ${e.pathInSource}`);
      lines.push(`Error (${e.error.code}): ${e.error.message}`);
      for (const issue of issuesOf(e.error.details)) {
        lines.push(`  - ${issue.path}: ${issue.message}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  let copied = $state(false);
  async function copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // Clipboard blocked (permissions / insecure context).
      toast.error(m.preview_error_copy_failed());
    }
  }
</script>

<div class="border-destructive/40 bg-destructive/5 border p-6">
  <div class="flex items-start gap-3">
    <AlertTriangle class="text-destructive mt-0.5 size-5 shrink-0" />
    <div class="min-w-0 flex-1">
      <h2 class="text-foreground text-lg font-medium">{m.preview_error_title()}</h2>
      <p class="text-muted-foreground mt-1 text-sm">{m.preview_error_description()}</p>

      <ul class="mt-4 flex flex-col gap-4">
        {#each errors as e (e.pathFromProjectRoot)}
          <li class="border-foreground/10 border-t pt-4 first:border-t-0 first:pt-0">
            <p class="text-foreground font-mono text-sm break-all">{e.pathInSource}</p>
            <p class="text-muted-foreground mt-1 text-sm">{e.error.message}</p>
            {#if issuesOf(e.error.details).length > 0}
              <ul class="mt-2 flex flex-col gap-1">
                {#each issuesOf(e.error.details) as issue (issue.path + issue.message)}
                  <li class="text-muted-foreground text-sm">
                    <span class="text-foreground font-mono">{issue.path}</span>
                    {#if issue.path.length > 0}&middot;{/if}
                    {issue.message}
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>

      <button
        type="button"
        onclick={() => void copyPrompt()}
        class="border-foreground/15 hover:border-foreground/40 text-foreground mt-5 inline-flex h-10 cursor-pointer items-center gap-2 border px-4 text-sm font-medium transition-colors"
      >
        {#if copied}
          <Check class="size-4" />
          {m.preview_error_copied()}
        {:else}
          <Copy class="size-4" />
          {m.preview_error_copy()}
        {/if}
      </button>
    </div>
  </div>
</div>
