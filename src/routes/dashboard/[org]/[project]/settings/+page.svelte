<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
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

  // Auto-sync (webhook) state. `webhook` is null for native projects.
  const wh = $derived(data.webhook);
  // The raw secret is returned once, right after generating it.
  const freshSecret = $derived(
    f?.action === "enableWebhook" && typeof f.secret === "string" ? f.secret : null,
  );
  let webhookSubmitting = $state(false);
  let copied = $state<string | null>(null);

  async function copyText(text: string, key: string) {
    // Best-effort: clipboard can reject (permissions / insecure context); leave
    // the value on screen so it can be copied by hand.
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      setTimeout(() => {
        if (copied === key) copied = null;
      }, 2000);
    } catch {
      copied = null;
    }
  }

  function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString();
  }
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

  {#if wh}
    <section class="mb-16 max-w-2xl">
      <h2 class="text-foreground mb-2 text-xl font-semibold tracking-tight sm:text-2xl">
        {m.dashboard_project_webhook_heading()}
      </h2>
      <p class="text-muted-foreground mb-4 text-sm">
        {m.dashboard_project_webhook_description()}
      </p>

      {#if !wh.enabled && !freshSecret}
        <form
          method="POST"
          action="?/enableWebhook"
          use:enhance={() => {
            webhookSubmitting = true;
            return async ({ update }) => {
              await update({ reset: false });
              webhookSubmitting = false;
            };
          }}
        >
          <Button type="submit" disabled={webhookSubmitting} class="h-10 px-5">
            {webhookSubmitting
              ? m.dashboard_project_webhook_enabling()
              : m.dashboard_project_webhook_enable_button()}
          </Button>
        </form>
      {:else}
        {#if freshSecret}
          <div class="border-primary/30 bg-primary/5 mb-4 border-l-2 p-4">
            <p class="text-foreground mb-2 text-sm font-medium">
              {m.dashboard_project_webhook_secret_label()}
            </p>
            <div class="flex items-center gap-2">
              <code
                class="bg-background min-w-0 flex-1 truncate border px-2 py-1 font-mono text-sm"
              >
                {freshSecret}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-8 shrink-0 gap-1.5"
                onclick={() => copyText(freshSecret, "secret")}
              >
                {#if copied === "secret"}
                  <Check class="size-4" />{m.dashboard_project_webhook_copied()}
                {:else}
                  <Copy class="size-4" />{m.dashboard_project_webhook_copy()}
                {/if}
              </Button>
            </div>
            <p class="text-muted-foreground mt-2 text-xs">
              {m.dashboard_project_webhook_secret_warning()}
            </p>
          </div>
        {/if}

        <div class="mb-3">
          <p class="text-foreground mb-1 text-sm font-medium">
            {m.dashboard_project_webhook_url_label()}
          </p>
          <div class="flex items-center gap-2">
            <code class="bg-background min-w-0 flex-1 truncate border px-2 py-1 font-mono text-sm">
              {wh.url}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-8 shrink-0 gap-1.5"
              onclick={() => copyText(wh.url, "url")}
            >
              {#if copied === "url"}
                <Check class="size-4" />{m.dashboard_project_webhook_copied()}
              {:else}
                <Copy class="size-4" />{m.dashboard_project_webhook_copy()}
              {/if}
            </Button>
          </div>
          <p class="text-muted-foreground mt-1 text-xs">
            {m.dashboard_project_webhook_content_type_label()}
          </p>
        </div>

        <ol class="text-muted-foreground mb-4 list-decimal space-y-1 pl-5 text-sm">
          {#if wh.provider === "github"}
            <li>{m.dashboard_project_webhook_github_step_1()}</li>
            <li>{m.dashboard_project_webhook_github_step_2()}</li>
            <li>{m.dashboard_project_webhook_github_step_3()}</li>
            <li>{m.dashboard_project_webhook_github_step_4()}</li>
          {:else}
            <li>{m.dashboard_project_webhook_codeberg_step_1()}</li>
            <li>{m.dashboard_project_webhook_codeberg_step_2()}</li>
            <li>{m.dashboard_project_webhook_codeberg_step_3()}</li>
            <li>{m.dashboard_project_webhook_codeberg_step_4()}</li>
          {/if}
        </ol>

        <p class="text-muted-foreground mb-4 text-sm">
          {#if wh.lastEventAt}
            {m.dashboard_project_webhook_last_received({ when: formatWhen(wh.lastEventAt) })}
          {:else}
            {m.dashboard_project_webhook_last_received_never()}
          {/if}
        </p>

        <div class="flex flex-wrap gap-3">
          <form
            method="POST"
            action="?/enableWebhook"
            use:enhance={() => {
              webhookSubmitting = true;
              return async ({ update }) => {
                await update({ reset: false });
                webhookSubmitting = false;
              };
            }}
          >
            <Button type="submit" variant="outline" disabled={webhookSubmitting} class="h-9">
              {m.dashboard_project_webhook_regenerate_button()}
            </Button>
          </form>
          <form method="POST" action="?/disableWebhook" use:enhance>
            <Button type="submit" variant="ghost" class="text-muted-foreground h-9">
              {m.dashboard_project_webhook_disable_button()}
            </Button>
          </form>
        </div>
      {/if}

      {#if actionError("enableWebhook")}
        <p class="text-destructive mt-2 text-sm">{errorMessage(actionError("enableWebhook"))}</p>
      {/if}
    </section>
  {/if}

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
