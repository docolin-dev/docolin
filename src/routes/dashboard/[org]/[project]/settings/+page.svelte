<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { LIMITS } from "$lib/limits";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const f = $derived((form ?? null) as Record<string, unknown> | null);
  function actionError(action: string): string | null {
    if (f?.action !== action || typeof f.error !== "string") return null;
    return f.error;
  }
  function errorMessage(code: string | null): string | null {
    if (code === null) return null;
    if (code === "confirm_mismatch") return m.dashboard_settings_error_confirm_mismatch();
    return m.dashboard_settings_error_generic();
  }

  let confirmSlug = $state("");
  let renameSubmitting = $state(false);
</script>

<svelte:head>
  <title>
    {m.dashboard_project_settings_meta_title()} · {data.project.displayName ?? data.project.slug}
  </title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-4xl">
  <!-- Same header voice as the project dashboard page: mono breadcrumb
       eyebrow, big h1. -->
  <div class="mb-14">
    <a
      href={localizeHref(`/dashboard/${data.orgSlug}/${data.project.slug}`)}
      class="text-muted-foreground/80 hover:text-foreground font-mono text-sm transition-colors"
    >
      {data.orgSlug}/{data.project.slug}
    </a>
    <h1 class="text-foreground mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
      {m.dashboard_project_settings_heading()}
    </h1>
  </div>

  <section class="mb-16 max-w-2xl">
    <h2 class="text-foreground mb-4 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_settings_name_heading()}
    </h2>
    <form
      method="POST"
      action="?/rename"
      use:enhance={() => {
        renameSubmitting = true;
        return async ({ update }) => {
          await update({ reset: false });
          renameSubmitting = false;
        };
      }}
      class="flex items-end gap-3"
    >
      <div class="flex flex-1 flex-col gap-1.5">
        <label for="project-display-name" class="text-sm font-medium">
          {m.dashboard_settings_name_label()}
        </label>
        <Input
          id="project-display-name"
          name="displayName"
          value={data.project.displayName ?? ""}
          placeholder={data.project.slug}
          maxlength={LIMITS.displayName}
          class="h-10"
        />
      </div>
      <Button type="submit" disabled={renameSubmitting} class="h-10 px-5">
        {renameSubmitting ? m.dashboard_settings_saving() : m.dashboard_settings_save()}
      </Button>
    </form>
    {#if actionError("rename")}
      <p class="text-destructive mt-2 text-sm">{errorMessage(actionError("rename"))}</p>
    {/if}
  </section>

  <section class="border-destructive/40 max-w-2xl border p-6">
    <h2 class="text-destructive mb-2 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_settings_danger_heading()}
    </h2>
    <p class="text-muted-foreground mb-4 text-sm">
      {m.dashboard_project_settings_delete_description()}
    </p>
    <form method="POST" action="?/deleteProject" use:enhance class="flex items-end gap-3">
      <div class="flex flex-1 flex-col gap-1.5">
        <label for="confirm-project-slug" class="text-sm font-medium">
          {m.dashboard_settings_delete_confirm_label({ slug: data.project.slug })}
        </label>
        <Input
          id="confirm-project-slug"
          name="confirmSlug"
          bind:value={confirmSlug}
          autocomplete="off"
          class="h-10 font-mono"
        />
      </div>
      <Button
        type="submit"
        variant="destructive"
        disabled={confirmSlug !== data.project.slug}
        class="h-10 px-5"
      >
        {m.dashboard_project_settings_delete_button()}
      </Button>
    </form>
    {#if actionError("deleteProject")}
      <p class="text-destructive mt-2 text-sm">{errorMessage(actionError("deleteProject"))}</p>
    {/if}
  </section>
</div>
