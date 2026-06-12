<script lang="ts">
  import { enhance } from "$app/forms";
  import { m } from "$paraglide/messages";
  import { getLocale, localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { LIMITS } from "$lib/limits";
  import type { PageProps } from "./$types";

  // Org settings: identity (rename), people (members), then the dangerous
  // stuff last and visually apart. Members see the list and their own leave
  // button; only the admin sees mutating controls.
  let { data, form }: PageProps = $props();

  const f = $derived((form ?? null) as Record<string, unknown> | null);
  function actionError(action: string): string | null {
    if (f?.action !== action || typeof f.error !== "string") return null;
    return f.error;
  }
  function errorMessage(code: string | null): string | null {
    if (code === null) return null;
    if (code === "handle_not_found") return m.dashboard_settings_error_handle_not_found();
    if (code === "already_member") return m.dashboard_settings_error_already_member();
    if (code === "handle_required") return m.dashboard_settings_error_handle_required();
    if (code === "confirm_mismatch") return m.dashboard_settings_error_confirm_mismatch();
    if (code === "is_admin") return m.dashboard_settings_error_admin_immovable();
    if (code === "has_projects") return m.dashboard_settings_error_has_projects();
    if (code === "is_personal") return m.dashboard_settings_error_is_personal();
    return m.dashboard_settings_error_generic();
  }

  function joinedLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(getLocale(), { year: "numeric", month: "short" });
  }

  let confirmSlug = $state("");
  const deleteBlocked = $derived(data.org.projectCount > 0 || data.org.isPersonal);
  let renameSubmitting = $state(false);
  let addSubmitting = $state(false);
</script>

<svelte:head>
  <title>{m.dashboard_org_settings_meta_title()} · {data.org.displayName ?? data.org.slug}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl">
  <!-- Same header voice as the org dashboard page: mono slug eyebrow, big
       h1. Settings is a sibling of that page, not a separate surface. -->
  <div class="mb-14">
    <a
      href={localizeHref(`/dashboard/${data.org.slug}`)}
      class="text-muted-foreground/80 hover:text-foreground font-mono text-sm transition-colors"
    >
      {data.org.slug}
    </a>
    <h1 class="text-foreground mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
      {m.dashboard_org_settings_heading()}
    </h1>
  </div>

  <!-- Identity -->
  <section class="mb-16 max-w-2xl">
    <h2 class="text-foreground mb-4 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_settings_name_heading()}
    </h2>
    {#if data.viewerIsAdmin}
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
          <label for="org-display-name" class="text-sm font-medium">
            {m.dashboard_settings_name_label()}
          </label>
          <Input
            id="org-display-name"
            name="displayName"
            value={data.org.displayName ?? ""}
            placeholder={data.org.slug}
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
    {:else}
      <p class="text-muted-foreground text-sm">{data.org.displayName ?? data.org.slug}</p>
    {/if}
  </section>

  <!-- Members -->
  <section class="mb-16 max-w-2xl">
    <h2 class="text-foreground mb-4 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_org_settings_members_heading()}
    </h2>
    <ul class="border-foreground/12 divide-foreground/12 divide-y border">
      {#each data.members as member (member.userId)}
        <li class="flex items-center justify-between gap-3 px-4 py-3">
          <div class="min-w-0">
            <p class="text-foreground truncate text-sm font-medium">
              {member.displayName ?? member.handle}
              {#if member.isAdmin}
                <span
                  class="border-foreground/15 text-muted-foreground ml-2 border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase"
                >
                  {m.dashboard_org_settings_admin_badge()}
                </span>
              {/if}
            </p>
            <p class="text-muted-foreground text-xs">
              <span class="font-mono">@{member.handle}</span>
              <span aria-hidden="true">·</span>
              {m.dashboard_org_settings_member_joined({ date: joinedLabel(member.joinedAt) })}
            </p>
          </div>
          {#if member.userId === data.viewerId && !member.isAdmin}
            <form method="POST" action="?/leave" use:enhance>
              <Button type="submit" variant="ghost" class="text-destructive h-8 px-3 text-xs">
                {m.dashboard_org_settings_member_leave()}
              </Button>
            </form>
          {:else if data.viewerIsAdmin && !member.isAdmin}
            <form method="POST" action="?/removeMember" use:enhance>
              <input type="hidden" name="userId" value={member.userId} />
              <Button type="submit" variant="ghost" class="text-destructive h-8 px-3 text-xs">
                {m.dashboard_org_settings_member_remove()}
              </Button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
    {#if actionError("removeMember") ?? actionError("leave")}
      <p class="text-destructive mt-2 text-sm">
        {errorMessage(actionError("removeMember") ?? actionError("leave"))}
      </p>
    {/if}

    {#if data.viewerIsAdmin}
      <form
        method="POST"
        action="?/addMember"
        use:enhance={() => {
          addSubmitting = true;
          return async ({ update }) => {
            await update();
            addSubmitting = false;
          };
        }}
        class="mt-4 flex items-end gap-3"
      >
        <div class="flex flex-1 flex-col gap-1.5">
          <label for="add-member-handle" class="text-sm font-medium">
            {m.dashboard_org_settings_member_add_label()}
          </label>
          <Input
            id="add-member-handle"
            name="handle"
            placeholder="@handle"
            maxlength={30}
            class="h-10 font-mono"
          />
        </div>
        <Button type="submit" disabled={addSubmitting} class="h-10 px-5">
          {addSubmitting
            ? m.dashboard_settings_saving()
            : m.dashboard_org_settings_member_add_button()}
        </Button>
      </form>
      {#if actionError("addMember")}
        <p class="text-destructive mt-2 text-sm">{errorMessage(actionError("addMember"))}</p>
      {/if}
    {/if}
  </section>

  <!-- Danger zone -->
  {#if data.viewerIsAdmin}
    <section class="border-destructive/40 max-w-2xl border p-6">
      <h2 class="text-destructive mb-2 text-xl font-semibold tracking-tight sm:text-2xl">
        {m.dashboard_settings_danger_heading()}
      </h2>
      {#if data.org.isPersonal}
        <p class="text-muted-foreground text-sm">
          {m.dashboard_org_settings_delete_blocked_personal()}
        </p>
      {:else if data.org.projectCount > 0}
        <p class="text-muted-foreground text-sm">
          {data.org.projectCount === 1
            ? m.dashboard_org_settings_delete_blocked_projects_one()
            : m.dashboard_org_settings_delete_blocked_projects({ count: data.org.projectCount })}
        </p>
      {:else}
        <p class="text-muted-foreground mb-4 text-sm">
          {m.dashboard_org_settings_delete_description()}
        </p>
        <form method="POST" action="?/deleteOrg" use:enhance class="flex items-end gap-3">
          <div class="flex flex-1 flex-col gap-1.5">
            <label for="confirm-org-slug" class="text-sm font-medium">
              {m.dashboard_settings_delete_confirm_label({ slug: data.org.slug })}
            </label>
            <Input
              id="confirm-org-slug"
              name="confirmSlug"
              bind:value={confirmSlug}
              autocomplete="off"
              class="h-10 font-mono"
            />
          </div>
          <Button
            type="submit"
            variant="destructive"
            disabled={deleteBlocked || confirmSlug !== data.org.slug}
            class="h-10 px-5"
          >
            {m.dashboard_org_settings_delete_button()}
          </Button>
        </form>
        {#if actionError("deleteOrg")}
          <p class="text-destructive mt-2 text-sm">{errorMessage(actionError("deleteOrg"))}</p>
        {/if}
      {/if}
    </section>
  {/if}
</div>
