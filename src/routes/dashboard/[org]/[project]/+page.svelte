<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
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
  import { pathFromSourcePath } from "$lib/doco-urls";
  import { forgeEditUrl } from "$lib/git/edit-url";

  // URL-derived identity for the immediate-render header.
  const orgSlug = $derived(page.params.org ?? "");
  const projectSlug = $derived(page.params.project ?? "");

  interface DocoRow {
    id: string;
    pathInSource: string | null;
    deletedAt: string | null;
    title: string;
    description: string | null;
    kind: string;
    type: string;
    status: string;
    versionNumber: number;
    commitSha: string | null;
    versionTag: string | null;
    publishedAt: string;
  }
  interface FileErrorRow {
    filePath: string;
    errorCode: string;
    errorMessage: string;
    errorDetails: unknown;
    syncedAt: string;
  }
  interface ProjectPayload {
    org: { slug: string; displayName: string | null };
    project: {
      id: string;
      slug: string;
      displayName: string | null;
      sourceMode: "git" | "native";
      createdAt: string;
    };
    gitSource: {
      repoUrl: string;
      defaultBranch: string;
      subpath: string | null;
      lastSyncedAt: string | null;
      syncStatus: "idle" | "syncing" | "error";
      syncError: string | null;
    } | null;
    fileErrors: FileErrorRow[];
    docos: DocoRow[];
  }

  let payload = $state<ProjectPayload | null>(null);
  let loadError = $state<string | null>(null);

  async function loadProject(): Promise<void> {
    loadError = null;
    try {
      const res = await fetch(
        `/api/dashboard/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(projectSlug)}`,
        { credentials: "same-origin" },
      );
      if (res.status === 401) return;
      if (!res.ok) {
        loadError = `HTTP ${res.status.toString()}`;
        return;
      }
      payload = (await res.json()) as ProjectPayload;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(() => {
    void loadProject();
  });

  const project = $derived(payload?.project ?? null);
  const gitSource = $derived(payload?.gitSource ?? null);
  const fileErrors = $derived(payload?.fileErrors ?? []);
  const docos = $derived(payload?.docos ?? []);
  const isGit = $derived(project === null ? null : project.sourceMode === "git");
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
  // stays the focal point. Initial value only; untrack signals intentional
  // non-reactivity once the user toggles their preference.
  let errorsExpanded = $state(false);
  let errorsInitialized = false;
  $effect(() => {
    if (errorsInitialized) return;
    if (payload === null) return;
    errorsExpanded = untrack(() => fileErrors.length > 0 && fileErrors.length <= 3);
    errorsInitialized = true;
  });

  // Live-poll the API while a sync is running so the status badge transitions
  // to idle/error without manual refresh. Replaces the old invalidateAll on
  // the server-loaded page; here it just re-fires the same fetch.
  $effect(() => {
    if (!isSyncing) return;
    const id = setInterval(() => {
      void loadProject();
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

  function docoUrl(pathInSource: string, subpath: string | null): string {
    return localizeHref(`/${orgSlug}/${projectSlug}/${pathFromSourcePath(pathInSource, subpath)}`);
  }

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
    {(project?.displayName ?? projectSlug) + " · " + orgSlug + " · " + m.dashboard_meta_title()}
  </title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-4xl">
  <!-- Title block: breadcrumb + mode badge always render in the same row.
       Title is the project's displayName when loaded, skeleton bar otherwise
       so the h1 height and the spacing below it never shift. -->
  <div class="mb-10">
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-muted-foreground/80 font-mono text-sm">
        {orgSlug}/{projectSlug}
      </span>
      {#if project}
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
      {/if}
    </div>
    {#if project}
      <div class="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 class="text-foreground text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {project.displayName ?? project.slug}
        </h1>
        <a
          href={localizeHref(`/dashboard/${orgSlug}/${projectSlug}/settings`)}
          class="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          {m.dashboard_settings_link()}
        </a>
      </div>
    {:else if loadError === null}
      <!-- h-9 matches text-3xl line-height (36px), sm:h-10 matches text-4xl
           (40px). Skeleton width approximates a typical displayName. -->
      <div class="bg-muted mt-4 h-9 w-56 animate-pulse sm:h-10 sm:w-64"></div>
    {/if}
  </div>

  {#if loadError !== null}
    <div
      class="border-destructive/40 bg-destructive/5 mb-8 flex items-center justify-between gap-4 border p-4"
    >
      <p class="text-destructive text-sm">{m.dashboard_load_error()}</p>
      <Button type="button" variant="outline" size="sm" onclick={() => void loadProject()}>
        {m.dashboard_load_error_retry()}
      </Button>
    </div>
  {/if}

  <!-- SOURCE section is always rendered during loading (we assume git, the
       common case) and only suppressed once the loaded payload says native.
       Eyebrow + section-spacing stay constant; only the inner meta block
       transitions from skeleton to real, so the Docos heading below doesn't
       shift vertically. -->
  {#if project === null || isGit}
    <section class="mb-12">
      <h2 class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
        {m.dashboard_project_source_heading()}
      </h2>
      {#if gitSource}
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
              <form
                method="POST"
                action="?/resync"
                use:enhance={() =>
                  async ({ update }) => {
                    await update();
                    // Pick up the new syncing state immediately; polling takes
                    // over from there until status leaves "syncing".
                    await loadProject();
                  }}
                class="ml-auto inline-flex"
              >
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
      {:else if loadError === null}
        <!-- Skeleton meta block. h-[150px] approximates the real meta's
             height: 4 rows (repo, branch, subpath, last-synced) ~120px +
             p-5 padding (40px) = ~160px. Tuned slightly under so projects
             without a subpath (3 rows) don't shrink-shift after load. -->
        <div class="border-foreground/15 bg-muted h-[150px] animate-pulse border"></div>
      {/if}
    </section>
  {/if}

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
                    href={forgeEditUrl(gitSource.repoUrl, gitSource.defaultBranch, fe.filePath)}
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

  <!-- Docos heading always renders so the section anchor doesn't shift when
       payload lands. Below it: real list when there are docos, empty state
       when payload has 0 docos, skeleton rows during loading. -->
  <section>
    <h2 class="text-foreground mb-6 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_project_docos_heading()}
    </h2>

    {#if payload && docos.length > 0}
      <ul class="border-foreground/15 divide-foreground/10 flex flex-col divide-y border">
        {#each docos as doco (doco.id)}
          {@const href =
            doco.pathInSource !== null
              ? docoUrl(doco.pathInSource, gitSource?.subpath ?? null)
              : null}
          <li class:opacity-60={doco.deletedAt !== null}>
            {#if href !== null}
              <a
                {href}
                class="group hover:bg-muted flex items-center gap-3 px-4 py-2.5 transition-colors"
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
    {:else if payload}
      <div
        class="border-foreground/10 bg-muted flex flex-col items-center border px-6 py-12 text-center"
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
    {:else if loadError === null}
      <!-- Skeleton rows. h-12 matches a typical real row: py-2.5 + title +
           kind subtext = ~48px. Three rows = common-case shape. With more
           real rows the list grows downward; with fewer it shrinks slightly
           (rare). -->
      <ul class="border-foreground/15 divide-foreground/10 flex flex-col divide-y border">
        <li class="bg-muted h-12 animate-pulse"></li>
        <li class="bg-muted h-12 animate-pulse"></li>
        <li class="bg-muted h-12 animate-pulse"></li>
      </ul>
    {/if}
  </section>
</div>
