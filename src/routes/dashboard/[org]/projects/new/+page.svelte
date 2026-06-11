<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { LIMITS } from "$lib/limits";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import HandlePicker from "$lib/components/HandlePicker.svelte";
  import { slugFromRepoName } from "$lib/git/slug-from-repo";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import type { PageProps } from "./$types";

  let { form }: PageProps = $props();
  // Org slug is in the URL; pull it straight from page params instead of a
  // server load so the page itself can be edge-cached as a static shell.
  const orgSlug = $derived(page.params.org ?? "");

  // Form action's union type confuses eslint inference; this read-through-
  // unknown helper preserves the prior value of a field across failed
  // submits without tripping the unsafe-member-access lint.
  function initialField(field: string): string {
    if (!form) return "";
    const value: unknown = (form as Record<string, unknown>)[field];
    if (typeof value === "string") return value;
    return "";
  }

  let repoUrl = $state(initialField("repoUrl"));
  let slug = $state(initialField("slug"));
  let displayName = $state(initialField("displayName"));
  let subpath = $state(initialField("subpath"));

  // Track whether the user has manually edited slug / displayName so we
  // don't clobber their input when a successful repo check would otherwise
  // autofill. Once they've typed in the field, autofill stops touching it.
  let slugTouched = $state(initialField("slug").length > 0);
  let displayNameTouched = $state(initialField("displayName").length > 0);

  let slugAvailable = $state<boolean>(false);
  let slugChecking = $state<boolean>(false);
  let submitting = $state(false);

  // Live GitHub repo reachability state. Endpoint returns owner/repo/
  // defaultBranch on success or a reason on failure. The result feeds the
  // autofill below; the server action does the authoritative check on
  // submit.
  let repoCheckState = $state<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ok"; owner: string; repo: string }
    | { kind: "fail"; reason: string }
  >({ kind: "idle" });

  async function checkRepoUrl(): Promise<void> {
    const value = repoUrl.trim();
    if (value.length === 0) {
      repoCheckState = { kind: "idle" };
      return;
    }
    repoCheckState = { kind: "checking" };
    try {
      const res = await fetch(`/api/github-repo-check?url=${encodeURIComponent(value)}`);
      const result = (await res.json()) as
        | { ok: true; owner: string; repo: string; defaultBranch: string }
        | { ok: false; reason: string };
      if (result.ok) {
        repoCheckState = { kind: "ok", owner: result.owner, repo: result.repo };
        // Autofill slug + display name from the repo name, but only if the
        // user hasn't touched those fields yet.
        if (!slugTouched) {
          slug = slugFromRepoName(result.repo);
        }
        if (!displayNameTouched) {
          displayName = result.repo;
        }
      } else {
        repoCheckState = { kind: "fail", reason: result.reason };
      }
    } catch {
      repoCheckState = { kind: "fail", reason: "network" };
    }
  }

  function repoCheckMessage(reason: string): string {
    if (reason === "invalid_url") return m.dashboard_new_project_error_invalid_url();
    if (reason === "not_found") return m.dashboard_new_project_error_repo_not_found();
    if (reason === "rate_limited") return m.dashboard_new_project_error_rate_limited();
    if (reason === "private") return m.dashboard_new_project_error_private();
    return m.dashboard_new_project_error_network();
  }

  function projectSlugMessage(reason: string): string {
    if (reason === "too_short") return m.dashboard_new_project_slug_status_too_short();
    if (reason === "too_long") return m.dashboard_new_project_slug_status_too_long();
    if (reason === "invalid_format") return m.dashboard_new_project_slug_status_invalid_format();
    if (reason === "reserved") return m.dashboard_new_project_slug_status_reserved();
    if (reason === "taken") return m.dashboard_new_project_slug_status_taken();
    return m.dashboard_new_project_slug_hint_idle();
  }

  function formErrorMessage(error: unknown): string | null {
    if (typeof error !== "string") return null;
    if (error === "slug_taken") return m.dashboard_new_project_slug_status_taken();
    if (error === "invalid_url") return m.dashboard_new_project_error_invalid_url();
    if (error === "not_found") return m.dashboard_new_project_error_repo_not_found();
    if (error === "rate_limited") return m.dashboard_new_project_error_rate_limited();
    if (error === "private") return m.dashboard_new_project_error_private();
    if (error === "network") return m.dashboard_new_project_error_network();
    if (error === "provision_failed") return m.dashboard_new_project_error_provision_failed();
    return null;
  }

  // Submit gating: slug must be valid + available; URL must be non-empty
  // (server validates the rest). The live repo check is informational and
  // doesn't block submit.
  const canSubmit = $derived(
    !submitting && !slugChecking && slugAvailable && repoUrl.trim().length > 0,
  );

  // HandlePicker doesn't expose an oninput hook for slug. Observe its value
  // here as the signal that the user has touched it. Once non-empty (via
  // user typing OR autofill), we flag touched so the autofill stops on the
  // next URL check.
  $effect(() => {
    if (slug.length > 0) {
      slugTouched = true;
    }
  });
</script>

<svelte:head>
  <title>{m.dashboard_new_project_meta_title()}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-2xl">
  <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.22em] uppercase">
    {m.dashboard_new_project_eyebrow()}
  </p>
  <h1 class="text-foreground text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
    {m.dashboard_new_project_title_git()}
  </h1>
  <p class="text-foreground/80 mt-4 max-w-xl text-base leading-relaxed">
    {m.dashboard_new_project_subtitle()}
  </p>

  <form
    method="POST"
    class="mt-10"
    use:enhance={() => {
      submitting = true;
      return ({ update }) => {
        void update().finally(() => {
          submitting = false;
        });
      };
    }}
  >
    <input type="hidden" name="sourceMode" value="git" />

    <!-- URL-first layout: the most information-dense field comes first.
         Pasting a valid URL autofills slug + display name below so the
         common path is "paste URL, submit." -->
    <div>
      <label
        for="repoUrl"
        class="text-foreground/55 mb-3 block font-mono text-[10px] tracking-[0.22em] uppercase"
      >
        {m.dashboard_new_project_repo_label()}
      </label>
      <Input
        id="repoUrl"
        name="repoUrl"
        type="url"
        bind:value={repoUrl}
        onblur={checkRepoUrl}
        placeholder={m.dashboard_new_project_repo_placeholder()}
        class="h-12 font-mono text-base"
        autofocus
      />
      <p
        class="mt-3 flex min-h-[1.25rem] items-center gap-1.5 text-xs"
        class:text-muted-foreground={repoCheckState.kind === "idle" ||
          repoCheckState.kind === "checking"}
        class:text-primary={repoCheckState.kind === "ok"}
        class:text-destructive={repoCheckState.kind === "fail"}
      >
        {#if repoCheckState.kind === "checking"}
          <LoaderCircle class="size-3.5 animate-spin" />
          {m.dashboard_new_project_repo_checking()}
        {:else if repoCheckState.kind === "ok"}
          <Check class="size-3.5" />
          {m.dashboard_new_project_repo_ok({
            owner: repoCheckState.owner,
            repo: repoCheckState.repo,
          })}
        {:else if repoCheckState.kind === "fail"}
          <X class="size-3.5" />
          {repoCheckMessage(repoCheckState.reason)}
        {:else}
          {m.dashboard_new_project_repo_hint()}
        {/if}
      </p>
    </div>

    <!-- Slug + display name + subpath. Autofill from the verified repo
         name when the user hasn't touched the field. -->
    <div class="mt-10">
      <label
        for="projectSlug"
        class="text-foreground/55 mb-3 block font-mono text-[10px] tracking-[0.22em] uppercase"
      >
        {m.dashboard_new_project_slug_label()}
      </label>
      <HandlePicker
        bind:value={slug}
        bind:isAvailable={slugAvailable}
        bind:isChecking={slugChecking}
        id="projectSlug"
        name="slug"
        checkUrl="/api/project-slug-check?org={encodeURIComponent(orgSlug)}"
        reasonToMessage={projectSlugMessage}
        idleHint={m.dashboard_new_project_slug_hint_idle()}
        checkingHint={m.dashboard_new_project_slug_hint_checking()}
        availableHint={m.dashboard_new_project_slug_hint_available()}
        prefix="docolin.com/{orgSlug}/"
        placeholder="my-docs"
        ariaLabel={m.dashboard_new_project_slug_label()}
      />
    </div>

    <div class="mt-8 space-y-5">
      <div>
        <label for="displayName" class="text-foreground/80 mb-2 block text-sm font-medium">
          {m.dashboard_new_project_displayname_label()}
        </label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          bind:value={displayName}
          oninput={() => (displayNameTouched = true)}
          maxlength={LIMITS.displayName}
          class="h-11"
        />
        <p class="text-muted-foreground mt-2 text-xs">
          {m.dashboard_new_project_displayname_hint()}
        </p>
      </div>

      <div>
        <label for="subpath" class="text-foreground/80 mb-2 block text-sm font-medium">
          {m.dashboard_new_project_subpath_label()}
        </label>
        <Input
          id="subpath"
          name="subpath"
          type="text"
          bind:value={subpath}
          placeholder="docs/"
          class="h-11 font-mono"
        />
        <p class="text-muted-foreground mt-2 text-xs">
          {m.dashboard_new_project_subpath_hint()}
        </p>
      </div>
    </div>

    {#if form?.error}
      {@const message = formErrorMessage(form.error)}
      {#if message}
        <p
          class="text-destructive border-destructive/30 bg-destructive/5 mt-8 border px-3 py-2 text-sm"
        >
          {message}
        </p>
      {/if}
    {/if}

    <div class="mt-8 flex items-center gap-3">
      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit}
        class="group h-11 flex-1 cursor-pointer gap-2 px-5 text-base"
      >
        {#if submitting}
          {m.dashboard_new_project_submitting()}
        {:else}
          {m.dashboard_new_project_submit()}
          <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
        {/if}
      </Button>
      <Button
        href={localizeHref(`/dashboard/${orgSlug}`)}
        variant="ghost"
        size="lg"
        class="h-11 cursor-pointer px-5 text-base"
      >
        {m.dashboard_new_project_cancel()}
      </Button>
    </div>
  </form>
</div>
