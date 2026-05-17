<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import FilePen from "@lucide/svelte/icons/file-pen";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import { Button } from "$lib/components/ui/button/index.js";
  import { buildPerFilePrompt, buildAllErrorsPrompt, type PromptIssue } from "$lib/sync/ai-prompt";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const project = $derived(data.project);
  const gitSource = $derived(data.gitSource);
  const fileErrors = $derived(data.fileErrors);
  const docos = $derived(data.docos);
  const isGit = $derived(project.sourceMode === "git");
  const isSyncing = $derived(gitSource?.syncStatus === "syncing");
  const isError = $derived(gitSource?.syncStatus === "error");
  const isFirstSync = $derived(isSyncing && gitSource?.lastSyncedAt === null);
  const hasSynced = $derived(
    gitSource?.lastSyncedAt !== null && gitSource?.lastSyncedAt !== undefined,
  );

  const dateFormatter = $derived(
    new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }),
  );
  const relativeFormatter = $derived(
    new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto", style: "long" }),
  );

  // Pre-expand small error lists, collapse larger ones so the docos list
  // stays the focal point of the page. Initial value only — once the user
  // toggles, their choice wins even if the error list changes on re-poll.
  // untrack signals the intentional non-reactivity.
  let errorsExpanded = $state(untrack(() => fileErrors.length > 0 && fileErrors.length <= 3));

  // Polling: while the sync is running, re-fetch page data every few seconds
  // so the badge transitions to idle / error without a manual refresh. $effect
  // cleans up the interval automatically when syncing transitions away.
  $effect(() => {
    if (!isSyncing) return;
    const id = setInterval(() => {
      void invalidateAll();
    }, 4000);
    return () => {
      clearInterval(id);
    };
  });

  function relativeTime(iso: string): string {
    const target = new Date(iso).getTime();
    const now = Date.now();
    const secondsDiff = Math.round((target - now) / 1000);
    const abs = Math.abs(secondsDiff);
    if (abs < 60) return relativeFormatter.format(secondsDiff, "second");
    const minutesDiff = Math.round(secondsDiff / 60);
    if (Math.abs(minutesDiff) < 60) return relativeFormatter.format(minutesDiff, "minute");
    const hoursDiff = Math.round(minutesDiff / 60);
    if (Math.abs(hoursDiff) < 24) return relativeFormatter.format(hoursDiff, "hour");
    const daysDiff = Math.round(hoursDiff / 24);
    return relativeFormatter.format(daysDiff, "day");
  }

  function versionLabel(
    versionTag: string | null,
    commitSha: string | null,
    versionNumber: number,
  ): string {
    if (versionTag !== null) return versionTag;
    if (commitSha !== null) return commitSha.slice(0, 7);
    return `v${String(versionNumber)}`;
  }

  // Constructs the GitHub web-editor URL for a file. Lets owners jump
  // straight from a sync error to "fix it here" without hunting through
  // their repo.
  function githubEditUrl(repoUrl: string, branch: string, path: string): string {
    const base = repoUrl.endsWith("/") ? repoUrl.slice(0, -1) : repoUrl;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `${base}/edit/${encodeURIComponent(branch)}/${encodedPath}`;
  }

  // Builds the canonical public doco URL: /{org}/{project}/{path-from-root}.
  // Strips the configured subpath prefix and the .md extension so the URL
  // matches the spec in docs/frontmatter-format.md. Pre-alpha: the public
  // render route doesn't exist yet, so this 404s for now — that's intentional,
  // it'll resolve once the public viewer ships.
  function docoUrl(
    orgSlug: string,
    projectSlug: string,
    pathInSource: string,
    subpath: string | null,
  ): string {
    let path = pathInSource;
    if (subpath !== null && subpath.length > 0) {
      const trimmed = subpath.endsWith("/") ? subpath.slice(0, -1) : subpath;
      if (path.startsWith(`${trimmed}/`)) {
        path = path.slice(trimmed.length + 1);
      }
    }
    if (path.toLowerCase().endsWith(".md")) {
      path = path.slice(0, -3);
    }
    return localizeHref(`/${orgSlug}/${projectSlug}/${path}`);
  }

  // Extracts the Zod issue list from a frontmatter_invalid error's details.
  // Returns null when the details don't have that shape (other error codes
  // store different payloads). Defensive narrowing because errorDetails is
  // jsonb (unknown at the type level).
  function extractIssues(details: unknown): PromptIssue[] | null {
    if (typeof details !== "object" || details === null) return null;
    const obj = details as Record<string, unknown>;
    const raw = obj.issues;
    if (!Array.isArray(raw)) return null;
    const out: PromptIssue[] = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const entry = item as Record<string, unknown>;
      if (typeof entry.path === "string" && typeof entry.message === "string") {
        out.push({ path: entry.path, message: entry.message });
      }
    }
    return out.length > 0 ? out : null;
  }

  // Maps sync_file_errors.error_code to a human-readable explanation.
  // Falls through to a generic "Sync error." for codes we haven't named.
  function friendlyErrorMessage(code: string): string {
    switch (code) {
      case "yaml_parse_error":
        return m.dashboard_project_sync_error_code_yaml_parse_error();
      case "frontmatter_invalid":
        return m.dashboard_project_sync_error_code_frontmatter_invalid();
      case "handle_not_found":
        return m.dashboard_project_sync_error_code_handle_not_found();
      case "fetch_failed":
        return m.dashboard_project_sync_error_code_fetch_failed();
      case "asset_too_large":
        return m.dashboard_project_sync_error_code_asset_too_large();
      case "asset_fetch_failed":
        return m.dashboard_project_sync_error_code_asset_fetch_failed();
      case "asset_upload_failed":
        return m.dashboard_project_sync_error_code_asset_upload_failed();
      default:
        return m.dashboard_project_sync_error_code_unknown();
    }
  }

  // The AI prompts are built in TS (not i18n) and are always English with a
  // "respond in {user_language}" preamble. See $lib/sync/ai-prompt for why.

  let copiedPath = $state<string | null>(null);
  async function copyAiPrompt(
    filePath: string,
    errorCode: string,
    issues: PromptIssue[] | undefined,
  ): Promise<void> {
    const text = buildPerFilePrompt({ filePath, errorCode, issues }, getLocale());
    await navigator.clipboard.writeText(text);
    copiedPath = filePath;
    setTimeout(() => {
      if (copiedPath === filePath) copiedPath = null;
    }, 2000);
  }

  // "Copy all" variant: one prompt that names every file's error and asks
  // the AI to address them in turn. Useful when several files broke from
  // the same root cause (e.g. a frontmatter template change).
  let copiedAll = $state(false);
  async function copyAllAiPrompt(): Promise<void> {
    const text = buildAllErrorsPrompt(
      fileErrors.map((fe) => ({
        filePath: fe.filePath,
        errorCode: fe.errorCode,
        issues: extractIssues(fe.errorDetails) ?? undefined,
      })),
      getLocale(),
    );
    await navigator.clipboard.writeText(text);
    copiedAll = true;
    setTimeout(() => {
      copiedAll = false;
    }, 2000);
  }
</script>

<svelte:head>
  <title>
    {project.displayName ?? project.slug} · {data.org.slug} · {m.dashboard_meta_title()}
  </title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-4xl">
  <!-- Project header. Slug (mono) + mode badge top row; display name as h1. -->
  <div class="mb-10">
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-muted-foreground/80 font-mono text-sm">
        {data.org.slug}/{project.slug}
      </span>
      <span
        class="text-muted-foreground border-border inline-flex shrink-0 items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] tracking-tight uppercase"
      >
        {#if isGit}
          <GitBranch class="size-3" />
          {m.dashboard_project_badge_git()}
        {:else}
          <FilePen class="size-3" />
          {m.dashboard_project_badge_native()}
        {/if}
      </span>
    </div>
    <h1 class="text-foreground mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
      {project.displayName ?? project.slug}
    </h1>
  </div>

  <!-- Source meta (git only): repo URL, subpath, default branch, sync state.
       Border + tint switch to destructive when the most recent sync failed,
       so the error state is visible from the page outline. -->
  {#if isGit && gitSource}
    <section class="mb-12">
      <h2 class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
        {m.dashboard_project_source_heading()}
      </h2>
      <div
        class="flex flex-col gap-3 border p-5 transition-colors {isError
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-foreground/15'}"
      >
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span class="text-muted-foreground">{m.dashboard_project_source_repo_label()}</span>
          <a
            href={gitSource.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-foreground hover:text-primary group inline-flex items-baseline gap-1 font-mono transition-colors"
          >
            <span>{gitSource.repoUrl.replace("https://", "")}</span>
            <ExternalLink class="size-3 self-center" />
          </a>
        </div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span class="text-muted-foreground">{m.dashboard_project_source_branch_label()}</span>
          <span class="text-foreground font-mono">{gitSource.defaultBranch}</span>
        </div>
        {#if gitSource.subpath}
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span class="text-muted-foreground">
              {m.dashboard_project_source_subpath_label()}
            </span>
            <span class="text-foreground font-mono">{gitSource.subpath}</span>
          </div>
        {/if}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="text-muted-foreground">{m.dashboard_project_source_synced_label()}</span>
          {#if isError}
            <span class="text-destructive font-medium">
              {m.dashboard_project_sync_status_error()}
            </span>
          {:else if isSyncing}
            <span class="text-foreground inline-flex items-center gap-2">
              <RefreshCw class="size-3.5 animate-spin" />
              {isFirstSync
                ? m.dashboard_project_sync_status_syncing_first()
                : m.dashboard_project_sync_status_syncing()}
            </span>
          {:else if gitSource.lastSyncedAt}
            <span
              class="text-foreground"
              title={dateFormatter.format(new Date(gitSource.lastSyncedAt))}
            >
              {m.dashboard_project_sync_status_synced_relative({
                when: relativeTime(gitSource.lastSyncedAt),
              })}
            </span>
          {:else}
            <span class="text-muted-foreground italic">
              {m.dashboard_project_sync_status_never()}
            </span>
          {/if}
          {#if !isSyncing}
            <!-- Hide the trigger button while a sync is in flight. The inline
                 "Syncing now" indicator on the left already carries the
                 visual state; a second spinner is redundant. -->
            <form method="POST" action="?/resync" use:enhance class="ml-auto inline-flex">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                class="size-8 cursor-pointer"
                aria-label={m.dashboard_project_sync_resync_aria()}
              >
                <RefreshCw class="size-4" />
              </Button>
            </form>
          {/if}
        </div>
        {#if isError && gitSource.syncError}
          <div class="border-destructive/30 mt-1 border-t pt-3 text-sm">
            <span class="text-muted-foreground">
              {m.dashboard_project_sync_status_error_label()}:
            </span>
            <span class="text-foreground ml-2">{gitSource.syncError}</span>
          </div>
        {/if}
      </div>
    </section>
  {/if}

  <!-- Per-file errors. Only renders when there are unresolved errors from the
       most recent sync; clears automatically when the next sync succeeds. -->
  {#if isGit && gitSource && fileErrors.length > 0}
    <section class="border-destructive/40 bg-destructive/5 mb-12 border">
      <div class="flex items-center gap-3 px-5 py-4">
        <button
          type="button"
          class="flex flex-1 cursor-pointer items-center gap-2 text-left"
          onclick={() => (errorsExpanded = !errorsExpanded)}
          aria-expanded={errorsExpanded}
        >
          <AlertTriangle class="text-destructive size-4 shrink-0" />
          <span class="text-foreground font-medium">
            {fileErrors.length === 1
              ? m.dashboard_project_sync_errors_heading_one()
              : m.dashboard_project_sync_errors_heading_many({ count: fileErrors.length })}
          </span>
        </button>
        <button
          type="button"
          onclick={() => void copyAllAiPrompt()}
          class="border-foreground/20 hover:border-foreground/40 text-foreground bg-background inline-flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors"
        >
          {#if copiedAll}
            <Check class="size-3" />
            {m.dashboard_project_sync_error_copy_done()}
          {:else}
            <Copy class="size-3" />
            {m.dashboard_project_sync_error_copy_all_prompt()}
          {/if}
        </button>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs transition-colors"
          onclick={() => (errorsExpanded = !errorsExpanded)}
          aria-expanded={errorsExpanded}
        >
          {errorsExpanded
            ? m.dashboard_project_sync_errors_collapse()
            : m.dashboard_project_sync_errors_expand()}
          {#if errorsExpanded}
            <ChevronUp class="size-3.5" />
          {:else}
            <ChevronDown class="size-3.5" />
          {/if}
        </button>
      </div>
      {#if errorsExpanded}
        <div class="border-destructive/20 border-t px-5 pt-3 pb-5">
          <p class="text-muted-foreground mb-4 text-sm leading-relaxed">
            {m.dashboard_project_sync_errors_subtext()}
          </p>
          <ul class="flex flex-col gap-3">
            {#each fileErrors as fe (fe.filePath)}
              {@const issues = extractIssues(fe.errorDetails)}
              <li class="border-foreground/10 bg-background border p-4">
                <div class="text-foreground/90 mb-1 font-mono text-sm break-all">
                  {fe.filePath}
                </div>
                <p class="text-foreground mb-3 text-sm leading-relaxed">
                  {friendlyErrorMessage(fe.errorCode)}
                </p>
                {#if issues}
                  <ul
                    class="text-foreground/80 mb-3 list-disc space-y-1 pl-5 font-mono text-xs leading-relaxed"
                  >
                    {#each issues as issue (`${issue.path}::${issue.message}`)}
                      <li>
                        <span class="text-muted-foreground">{issue.path || "(root)"}</span>:
                        <span class="text-foreground">{issue.message}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <a
                    href={githubEditUrl(gitSource.repoUrl, gitSource.defaultBranch, fe.filePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="border-foreground/20 hover:border-foreground/40 text-foreground inline-flex items-center gap-1.5 border px-2.5 py-1 transition-colors"
                  >
                    <ExternalLink class="size-3" />
                    {m.dashboard_project_sync_error_open_in_github()}
                  </a>
                  <button
                    type="button"
                    onclick={() =>
                      void copyAiPrompt(fe.filePath, fe.errorCode, issues ?? undefined)}
                    class="border-foreground/20 hover:border-foreground/40 text-foreground inline-flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 transition-colors"
                  >
                    {#if copiedPath === fe.filePath}
                      <Check class="size-3" />
                      {m.dashboard_project_sync_error_copy_done()}
                    {:else}
                      <Copy class="size-3" />
                      {m.dashboard_project_sync_error_copy_prompt()}
                    {/if}
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/if}

  <!-- Docos section. Renders the live list when there are published versions,
       otherwise picks an empty-state variant based on whether the project has
       synced and whether every eligible file errored out. -->
  <section>
    <h2 class="text-foreground mb-6 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_project_docos_heading()}
    </h2>

    {#if docos.length > 0}
      <!-- Dense single-line rows. Whole row is the click target (link to the
           public doco URL); title + kind on the left, type/status/badge
           pushed right. Optimized for scanning a long list rather than
           admiring a short one. -->
      <ul class="border-foreground/15 divide-foreground/10 flex flex-col divide-y border">
        {#each docos as doco (doco.id)}
          {@const href =
            doco.pathInSource !== null
              ? docoUrl(data.org.slug, project.slug, doco.pathInSource, gitSource?.subpath ?? null)
              : null}
          <li class:opacity-60={doco.deletedAt !== null}>
            {#if href !== null}
              <a
                {href}
                class="group hover:bg-muted/30 flex items-center gap-3 px-4 py-2.5 transition-colors"
              >
                <div class="min-w-0 flex-1">
                  <div class="text-foreground truncate font-medium">{doco.title}</div>
                  <div class="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                    {doco.kind}
                  </div>
                </div>
                <span
                  class="text-muted-foreground shrink-0 font-mono text-xs"
                  title={dateFormatter.format(new Date(doco.publishedAt))}
                >
                  {versionLabel(doco.versionTag, doco.commitSha, doco.versionNumber)}
                </span>
                <span class="text-muted-foreground shrink-0 text-xs">
                  {relativeTime(doco.publishedAt)}
                </span>
                <span class="text-muted-foreground shrink-0 font-mono text-xs">{doco.type}</span>
                {#if doco.status !== "stable"}
                  <span class="shrink-0 font-mono text-xs text-amber-700">{doco.status}</span>
                {/if}
                {#if doco.deletedAt}
                  <span class="text-destructive shrink-0 font-mono text-xs">
                    {m.dashboard_project_doco_badge_deleted()}
                  </span>
                {/if}
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <div
        class="border-foreground/10 bg-muted/30 flex flex-col items-center border px-6 py-12 text-center"
      >
        <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
          {m.dashboard_project_docos_empty_eyebrow()}
        </p>
        <h3 class="text-foreground text-xl font-medium tracking-tight text-balance">
          {#if !isGit}
            {m.dashboard_project_docos_empty_title_native()}
          {:else if !hasSynced}
            {m.dashboard_project_docos_empty_title_git()}
          {:else if fileErrors.length > 0}
            {m.dashboard_project_docos_empty_title_synced_errors_only()}
          {:else}
            {m.dashboard_project_docos_empty_title_synced_nothing()}
          {/if}
        </h3>
        <p class="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed">
          {#if !isGit}
            {m.dashboard_project_docos_empty_body_native()}
          {:else if !hasSynced}
            {m.dashboard_project_docos_empty_body_git()}
          {:else if fileErrors.length > 0}
            {m.dashboard_project_docos_empty_body_synced_errors_only()}
          {:else}
            {m.dashboard_project_docos_empty_body_synced_nothing()}
          {/if}
        </p>
        {#if isGit && !hasSynced}
          <p class="text-muted-foreground/70 mt-4 max-w-md text-xs leading-relaxed">
            {m.dashboard_project_docos_empty_webhook_teaser()}
          </p>
        {/if}
      </div>
    {/if}
  </section>
</div>
