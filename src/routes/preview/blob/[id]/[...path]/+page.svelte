<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { reopenSession } from "$lib/preview/preview-session";

  // The preview counterpart of a forge "view source" link: a doco linked a
  // non-doco repo file (e.g. ../src/index.ts), and in preview that resolves
  // here. Read the local working file and hand it to the browser to render
  // natively via a blob: URL (text as text, images as images), no UI of our own.
  const id = $derived(page.params.id ?? "");
  const filePath = $derived(page.params.path ?? "");
  let failed = $state(false);

  $effect(() => {
    failed = false;
    void (async () => {
      try {
        const result = await reopenSession(id);
        if (result.status !== "ok") {
          failed = true;
          return;
        }
        const blob = await result.session.source.readBlob(filePath);
        if (blob === null) {
          failed = true;
          return;
        }
        // Source files often get a wrong or empty type from the OS (a .ts is
        // sometimes "video/mp2t"); force text/* for code so it displays instead of
        // downloading, and trust the type only for images/pdf.
        const type = displayType(filePath, blob.type);
        const url = URL.createObjectURL(type === blob.type ? blob : new Blob([blob], { type }));
        window.location.replace(url);
      } catch {
        // A failed handle re-acquire or file read must not leave the page stuck
        // on "loading"; show the failure UI instead.
        failed = true;
      }
    })();
  });

  const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp"];
  function displayType(path: string, current: string): string {
    const ext = extensionOf(path);
    if (IMAGE_EXTS.includes(ext))
      return current !== "" ? current : `image/${ext === "svg" ? "svg+xml" : ext}`;
    if (ext === "pdf") return "application/pdf";
    // Everything else: show as UTF-8 text rather than triggering a download.
    return "text/plain; charset=utf-8";
  }
  function extensionOf(path: string): string {
    const dot = path.lastIndexOf(".");
    const slash = path.lastIndexOf("/");
    return dot > slash ? path.slice(dot + 1).toLowerCase() : "";
  }
</script>

<svelte:head>
  <title>{m.preview_meta_title()} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto flex max-w-md flex-col items-center px-6 pt-32 pb-10 text-center">
  {#if failed}
    <h1 class="text-foreground text-2xl font-semibold tracking-tight">
      {m.preview_blob_failed_title()}
    </h1>
    <p class="text-muted-foreground mt-2 text-sm break-all">{filePath}</p>
    <a
      href={localizeHref(`/preview/${id}`)}
      class="text-primary mt-6 text-sm underline-offset-4 hover:underline"
    >
      {m.preview_blob_back()}
    </a>
  {:else}
    <p class="text-muted-foreground text-sm">{m.preview_loading()}</p>
  {/if}
</div>
