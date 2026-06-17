<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import MaskedEmail from "$lib/components/MaskedEmail.svelte";
  import { LIMITS } from "$lib/limits";
  import type { PageProps } from "./$types";

  // Account page. Eye order: who am I here (eyebrow + h1), what does docolin
  // hold about me (identity section: editable display name, fixed handle,
  // masked email), and at the very bottom, clearly quarantined, deletion with
  // its consequences spelled out before the confirm field.
  let { data, form }: PageProps = $props();

  const f = $derived((form ?? null) as Record<string, unknown> | null);
  function actionError(action: string): string | null {
    if (f?.action !== action || typeof f.error !== "string") return null;
    return f.error;
  }
  function errorMessage(code: string | null): string | null {
    if (code === null) return null;
    if (code === "confirm_mismatch") return m.dashboard_settings_error_confirm_mismatch();
    if (code === "blocked") return m.dashboard_account_delete_error_blocked();
    if (code === "workos_failed") return m.dashboard_account_delete_error_upstream();
    return m.dashboard_settings_error_generic();
  }

  // Only admin'd organizations block deletion now: they need a deliberate
  // transfer or their own delete first. Personal projects don't block; they
  // freeze (stop syncing, guides preserved) when the account is deleted.
  const blocked = $derived(data.account.blockingOrgSlugs.length > 0);
  let confirmHandle = $state("");
  let renameSubmitting = $state(false);
  let deleteSubmitting = $state(false);
</script>

<svelte:head>
  <title>{m.dashboard_account_meta_title()} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-4xl">
  <div class="mb-14">
    <span class="text-muted-foreground/80 font-mono text-sm">@{data.account.handle}</span>
    <h1 class="text-foreground mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
      {m.dashboard_account_heading()}
    </h1>
  </div>

  <!-- Identity -->
  <section class="mb-16 max-w-2xl">
    <h2 class="text-foreground mb-4 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_account_identity_heading()}
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
        <label for="account-display-name" class="text-sm font-medium">
          {m.dashboard_settings_name_label()}
        </label>
        <Input
          id="account-display-name"
          name="displayName"
          value={data.account.displayName ?? ""}
          placeholder={data.account.handle}
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

    <dl class="text-sm">
      <div class="border-foreground/12 mt-6 flex items-center justify-between gap-3 border-t pt-4">
        <dt class="text-muted-foreground">{m.dashboard_account_handle_label()}</dt>
        <dd class="flex items-center gap-2">
          <span class="font-mono">@{data.account.handle}</span>
          <span class="text-muted-foreground text-xs">{m.dashboard_account_handle_fixed()}</span>
        </dd>
      </div>
      {#if data.account.email !== null}
        <div class="flex items-center justify-between gap-3 pt-3">
          <dt class="text-muted-foreground">{m.dashboard_account_email_label()}</dt>
          <dd><MaskedEmail email={data.account.email} /></dd>
        </div>
      {/if}
    </dl>
  </section>

  <!-- Danger zone -->
  <section class="border-destructive/40 max-w-2xl border p-6">
    <h2 class="text-destructive mb-2 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_settings_danger_heading()}
    </h2>
    {#if data.account.blockingOrgSlugs.length > 0}
      <p class="text-muted-foreground text-sm">
        {m.dashboard_account_delete_blocked_orgs()}
      </p>
      <ul class="mt-2 flex flex-wrap gap-2">
        {#each data.account.blockingOrgSlugs as slug (slug)}
          <li>
            <a
              href={localizeHref(`/dashboard/${slug}/settings`)}
              class="text-primary font-mono text-sm hover:underline"
            >
              {slug}
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      {#if data.account.personalProjectCount > 0}
        <p class="text-muted-foreground mb-1 text-sm">
          {data.account.personalProjectCount === 1
            ? m.dashboard_account_delete_blocked_projects_one()
            : m.dashboard_account_delete_blocked_projects({
                count: data.account.personalProjectCount,
              })}
        </p>
      {/if}
      <p class="text-muted-foreground mb-1 text-sm">
        {m.dashboard_account_delete_description()}
      </p>
      <p class="text-muted-foreground mb-4 text-sm">
        {m.dashboard_account_delete_content_note()}
      </p>
      <form
        method="POST"
        action="?/deleteAccount"
        use:enhance={() => {
          deleteSubmitting = true;
          return async ({ update }) => {
            await update({ reset: false });
            deleteSubmitting = false;
          };
        }}
        class="flex items-end gap-3"
      >
        <div class="flex flex-1 flex-col gap-1.5">
          <label for="confirm-handle" class="text-sm font-medium">
            {m.dashboard_settings_delete_confirm_label({ slug: data.account.handle })}
          </label>
          <Input
            id="confirm-handle"
            name="confirmHandle"
            bind:value={confirmHandle}
            autocomplete="off"
            class="h-10 font-mono"
          />
        </div>
        <Button
          type="submit"
          variant="destructive"
          disabled={blocked ||
            deleteSubmitting ||
            confirmHandle.replace("@", "") !== data.account.handle}
          class="h-10 px-5"
        >
          {deleteSubmitting
            ? m.dashboard_account_delete_running()
            : m.dashboard_account_delete_button()}
        </Button>
      </form>
      {#if actionError("deleteAccount")}
        <p class="text-destructive mt-2 text-sm">{errorMessage(actionError("deleteAccount"))}</p>
      {/if}
    {/if}
  </section>
</div>
