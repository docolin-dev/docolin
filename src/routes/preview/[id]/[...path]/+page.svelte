<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import DocoView from "$lib/components/doco/DocoView.svelte";
  import PreviewErrorBlock from "$lib/components/preview/PreviewErrorBlock.svelte";
  import PreviewProblems from "$lib/components/preview/PreviewProblems.svelte";
  import PreviewBar from "$lib/components/preview/PreviewBar.svelte";
  import {
    reopenSession,
    reimportSession,
    type PreviewSession,
  } from "$lib/preview/preview-session";
  import {
    reopenDirectory,
    reuploadFiles,
    pickDirectory,
    changeProjectSubpath,
  } from "$lib/preview/open-folder";
  import { renderPreviewDoco, type RenderedPreview } from "$lib/preview/render-doco";
  import {
    firstDocoPath,
    type ImportedDocoError,
    type ImportedProject,
  } from "$lib/preview/import-project";
  import { saveProject, setLastPath, type PreviewProjectMeta } from "$lib/preview/project-store";
  import { renderMarkdownPreview } from "$lib/markdown-shared";
  import type { DocoFrontmatter } from "$lib/sync/frontmatter-schema";
  import type { ResolvedAuthor } from "$lib/doco/viewer-data";

  const id = $derived(page.params.id ?? "");
  const routePath = $derived(page.params.path ?? "");

  type Status =
    | "loading"
    | "rendered"
    | "doco_error"
    | "doco_not_found"
    | "need_reopen"
    | "permission"
    | "not_found";
  let status = $state<Status>("loading");
  let session = $state<PreviewSession | null>(null);
  let reopenMeta = $state<PreviewProjectMeta | null>(null);
  let rendered = $state<RenderedPreview | null>(null);
  let errorDoco = $state<ImportedDocoError | null>(null);
  let rawHref = $state("");
  let refreshing = $state(false);
  let uploadInput = $state<HTMLInputElement | null>(null);

  // The doco to show within the project. An empty route path lands on the first
  // doco (a project entry point until a richer index exists).
  const docoKey = $derived.by(() => {
    if (session === null) return "";
    if (routePath !== "") return routePath;
    return session.project.docos.keys().next().value ?? "";
  });

  // Load the session for the current id.
  $effect(() => {
    const wantId = id;
    if (session !== null && session.meta.id === wantId) return;
    status = "loading";
    void (async () => {
      const result = await reopenSession(wantId);
      if (id !== wantId) return;
      if (result.status === "ok") {
        session = result.session;
        saveProject({ ...result.session.meta, lastOpenedAt: Date.now() });
        // Landed on the bare project URL: open the first doco so the URL points
        // at a real page (and bookmarks / recents without a remembered path work).
        if (routePath === "") {
          const first = firstDocoPath(result.session.project);
          if (first !== null) {
            await goto(localizeHref(`/preview/${wantId}/${first}`), { replaceState: true });
          }
        }
      } else if (result.status === "not_found") {
        status = "not_found";
      } else {
        reopenMeta = result.meta;
        status = result.status;
      }
    })();
  });

  // Render the doco at docoKey whenever the session or path changes.
  $effect(() => {
    const s = session;
    const key = docoKey;
    if (s === null) return;
    void renderCurrent(s, key);
  });

  // What `rendered` currently reflects. A live-reload re-import produces a fresh
  // project object every few seconds, but most of the time the file the reader is
  // looking at is byte-identical; re-rendering it anyway throws away interactive
  // state (the selected tab resets to the first). So we only re-render when this
  // doco's render inputs actually changed. Non-reactive on purpose.
  let renderedFingerprint = "";

  // Segments join on an escaped NUL: no real path or file content can contain it,
  // so nothing can fake a collision (escaped rather than a literal byte, which
  // would make git treat this file as binary).
  function docoFingerprint(key: string, project: ImportedProject): string {
    const doco = project.docos.get(key);
    if (doco !== undefined) {
      return [
        "D",
        key,
        doco.body,
        JSON.stringify(doco.frontmatter),
        JSON.stringify(doco.sitemap),
        doco.sitemapBasePath ?? "",
      ].join("\u0000");
    }
    const err = project.errors.get(key);
    if (err !== undefined) return ["E", key, JSON.stringify(err.error)].join("\u0000");
    return `M\u0000${key}`;
  }

  async function renderCurrent(s: PreviewSession, key: string): Promise<void> {
    const fingerprint = docoFingerprint(key, s.project);
    // Same doco, same content as what's on screen: keep it (and its tab state).
    if (fingerprint === renderedFingerprint) return;

    const doco = s.project.docos.get(key);
    if (doco === undefined) {
      cleanup();
      const errored = s.project.errors.get(key);
      if (errored !== undefined) {
        errorDoco = errored;
        status = "doco_error";
      } else {
        status = "doco_not_found";
      }
      renderedFingerprint = fingerprint;
      return;
    }
    const result = await renderPreviewDoco(doco, {
      projectId: s.meta.id,
      projectName: s.meta.name,
      source: s.source,
      project: s.project,
      resolveAuthors,
    });
    // Bail if we navigated or reloaded while rendering.
    if (session !== s || docoKey !== key) {
      result.revoke();
      return;
    }
    cleanup();
    rendered = result;
    errorDoco = null;
    rawHref = URL.createObjectURL(new Blob([result.data.doco.bodyText], { type: "text/markdown" }));
    status = "rendered";
    renderedFingerprint = fingerprint;
    setLastPath(s.meta.id, key);

    // The root layout wires markdown widgets, but it scans the DOM at navigation
    // time, before this client-rendered doco lands. Re-scan once the new HTML is
    // in the DOM so every per-render enhancement (diagrams, charts, swatches,
    // diff viewers, the saved tab choice) takes hold, same bundle as the layout.
    await tick();
    if (session === s && docoKey === key) {
      const markdown = await import("$lib/markdown/hydrate");
      markdown.enhanceRenderedMarkdown();
    }
  }

  async function changeSubpath(subpath: string | null): Promise<void> {
    const s = session;
    if (s === null) return;
    const next = await changeProjectSubpath(s, subpath);
    session = next;
    const first = firstDocoPath(next.project);
    await goto(localizeHref(`/preview/${next.meta.id}/${first ?? ""}`), { replaceState: true });
  }

  onMount(() => {
    // Warm the markdown renderer in case this page was deep-linked directly.
    void renderMarkdownPreview("");
  });

  function cleanup(): void {
    rendered?.revoke();
    rendered = null;
    if (rawHref !== "") {
      URL.revokeObjectURL(rawHref);
      rawHref = "";
    }
  }

  // Resolve author bylines via the public endpoint, so a preview matches a
  // published page; falls back to @handle offline (the profile link still works).
  async function resolveAuthors(authors: DocoFrontmatter["authors"]): Promise<ResolvedAuthor[]> {
    const handles = authors.flatMap((a) => (a.handle !== undefined ? [a.handle] : []));
    const names: Record<string, string | null> = {};
    if (handles.length > 0) {
      try {
        const res = await fetch(`/api/handles?h=${encodeURIComponent(handles.join(","))}`);
        if (res.ok) {
          const infos = (await res.json()) as { handle: string; displayName: string | null }[];
          for (const info of infos) names[info.handle] = info.displayName;
        }
      } catch {
        // Endpoint unreachable; @handle fallback below.
      }
    }
    return authors.map((a): ResolvedAuthor => {
      if (a.handle !== undefined) {
        return {
          kind: "user",
          userId: "",
          handle: a.handle,
          displayName: names[a.handle] ?? null,
          deleted: false,
        };
      }
      return {
        kind: "external",
        name: a.name ?? "",
        username: a.username ?? null,
        url: a.url ?? null,
      };
    });
  }

  // Live reload (File System Access only): re-import on window focus and on a
  // gentle interval, so edits show without a manual refresh. This runs silently
  // (no spinner); only a changed doco re-renders, via the fingerprint guard.
  $effect(() => {
    const s = session;
    if (s === null) return;
    if (!s.source.live) return;
    const onFocus = (): void => {
      void pollChanges();
    };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      void pollChanges();
    }, 3000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  });

  // Re-import from disk and swap in the fresh index. The render effect then
  // re-renders only if the viewed doco actually changed. Guarded against overlap.
  let polling = false;
  async function pollChanges(): Promise<void> {
    const s = session;
    if (s === null || polling) return;
    polling = true;
    const next = await reimportSession(s.meta.id);
    polling = false;
    if (next !== null && session === s) session = next;
  }

  // The manual refresh button: same poll, but show the spinner as feedback.
  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    await pollChanges();
    refreshing = false;
  }

  // Re-open flows for a cold deep-link or lost permission.
  async function reopenViaPicker(): Promise<void> {
    const meta = reopenMeta;
    if (meta === null) return;
    const handle = await pickDirectory();
    if (handle === null) return;
    const next = await reopenDirectory(meta, handle);
    reopenMeta = null;
    session = next;
  }

  function onUpload(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const meta = reopenMeta;
    const files = input.files === null ? [] : [...input.files];
    if (files.length === 0 || meta === null) return;
    void (async () => {
      const next = await reuploadFiles(files, meta);
      reopenMeta = null;
      session = next;
    })();
  }

  const kindSegments = $derived(rendered?.data.doco.kind.split("/") ?? []);
</script>

<svelte:head>
  <title>{rendered?.data.doco.title ?? m.preview_meta_title()} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if status === "rendered" && rendered !== null}
  <DocoView data={rendered.data} {rawHref} preview />
  <PreviewProblems warnings={rendered.warnings} />
  {#if session !== null}
    <PreviewBar
      meta={session.meta}
      {refreshing}
      onRefresh={() => {
        void refresh();
      }}
      onChangeSubpath={(s: string | null) => void changeSubpath(s)}
    />
  {/if}
{:else if status === "doco_error" && errorDoco !== null}
  <DocoViewerNavbar {kindSegments} />
  <div class="mx-auto max-w-3xl px-6 pt-24 pb-10">
    <PreviewErrorBlock errors={[errorDoco]} />
  </div>
  {#if session !== null}
    <PreviewBar
      meta={session.meta}
      {refreshing}
      onRefresh={() => {
        void refresh();
      }}
      onChangeSubpath={(s: string | null) => void changeSubpath(s)}
    />
  {/if}
{:else}
  <DocoViewerNavbar {kindSegments} />
  <div class="mx-auto flex max-w-md flex-col items-center px-6 pt-32 pb-10 text-center">
    {#if status === "loading"}
      <p class="text-muted-foreground text-sm">{m.preview_loading()}</p>
    {:else if status === "not_found"}
      <h1 class="text-foreground text-2xl font-semibold tracking-tight">
        {m.preview_not_found_title()}
      </h1>
      <p class="text-muted-foreground mt-2 text-sm">{m.preview_not_found_body()}</p>
      <a
        href={localizeHref("/preview")}
        class="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 inline-flex h-11 items-center gap-2 px-5 text-sm font-medium transition-colors"
      >
        <FolderOpen class="size-4" />
        {m.preview_back_to_projects()}
      </a>
    {:else if status === "doco_not_found"}
      <h1 class="text-foreground text-2xl font-semibold tracking-tight">
        {m.preview_doco_not_found_title()}
      </h1>
      <p class="text-muted-foreground mt-2 text-sm">{m.preview_doco_not_found_body()}</p>
    {:else if status === "need_reopen" || status === "permission"}
      <h1 class="text-foreground text-2xl font-semibold tracking-tight">
        {status === "permission" ? m.preview_permission_title() : m.preview_reopen_title()}
      </h1>
      <p class="text-muted-foreground mt-2 text-sm">
        {status === "permission" ? m.preview_permission_body() : m.preview_reopen_body()}
      </p>
      {#if reopenMeta?.mode === "upload"}
        <button
          type="button"
          onclick={() => uploadInput?.click()}
          class="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 inline-flex h-11 items-center gap-2 px-5 text-sm font-medium transition-colors"
        >
          <FolderOpen class="size-4" />
          {m.preview_reupload_button()}
        </button>
        <input
          bind:this={uploadInput}
          type="file"
          {...{ webkitdirectory: true }}
          onchange={onUpload}
          class="hidden"
        />
      {:else}
        <button
          type="button"
          onclick={() => void reopenViaPicker()}
          class="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 inline-flex h-11 items-center gap-2 px-5 text-sm font-medium transition-colors"
        >
          <FolderOpen class="size-4" />
          {m.preview_reopen_button()}
        </button>
      {/if}
    {/if}
  </div>
{/if}
