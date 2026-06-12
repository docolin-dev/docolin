<script lang="ts">
  import { goto } from "$app/navigation";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import Composer from "$lib/components/discussions/Composer.svelte";
  import { LIMITS } from "$lib/limits";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const discussionsBase = $derived(
    `/${data.org.slug}/${data.project.slug}/${data.docoPath}/discussions`,
  );

  // The action result's union shape varies (validation failures carry the
  // typed-back title/body, the 404 path doesn't), so read fields defensively.
  const f = $derived((form ?? null) as Record<string, unknown> | null);
  function field(key: string): string | undefined {
    const v = f?.[key];
    return typeof v === "string" ? v : undefined;
  }
  function errorMessage(code: string | undefined): string | null {
    if (code === "title_required") return m.discussion_error_title_required();
    if (code === "body_required") return m.discussion_error_body_required();
    if (code === "title_too_long") {
      return m.discussion_error_title_too_long({ max: LIMITS.discussionTitle });
    }
    if (code === "body_too_long") {
      return m.discussion_error_body_too_long({ max: LIMITS.discussionBody });
    }
    if (code === undefined) return null;
    return m.discussion_error_generic();
  }
</script>

<svelte:head>
  <title>{m.discussion_new_heading()} · {data.docoTitle} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<DocoViewerNavbar kindSegments={data.kindSegments} />

<div class="mx-auto max-w-3xl px-6 pt-24 pb-16">
  <a
    href={localizeHref(discussionsBase)}
    class="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
  >
    <ArrowLeft class="size-4" />
    {m.discussion_thread_back()}
  </a>

  <h1 class="text-foreground text-3xl font-semibold tracking-tight">
    {m.discussion_new_heading()}
  </h1>
  <p class="text-muted-foreground mt-1 text-sm">
    {m.discussion_new_subtitle()}
    <span class="text-muted-foreground/40">·</span>
    {data.docoTitle}
  </p>

  <div class="mt-6">
    <Composer
      action="?/create"
      withTitle
      titleLabel={m.discussion_compose_title_label()}
      titlePlaceholder={m.discussion_compose_title_placeholder()}
      bodyLabel={m.discussion_compose_body_label()}
      bodyPlaceholder={m.discussion_compose_body_placeholder()}
      submitLabel={m.discussion_compose_submit()}
      submittingLabel={m.discussion_compose_submitting()}
      signinLabel={m.discussion_compose_signin()}
      returnTo={`${discussionsBase}/new`}
      error={errorMessage(field("error"))}
      initialTitle={field("title") ?? ""}
      initialBody={field("body") ?? ""}
      oncancel={() => void goto(localizeHref(discussionsBase))}
    />
  </div>
</div>
