<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Plus from "@lucide/svelte/icons/plus";

  // URL-derived identity: org slug is in the path, so the breadcrumb-style
  // header can render instantly. Display name + project list come from the
  // API and pulse in once /api/dashboard/orgs/[org] resolves. Eye lands on
  // the slug header first either way, so the page feels structurally present
  // <50ms after the cached shell hits the browser.
  const orgSlug = $derived(page.params.org ?? "");

  interface ProjectCard {
    id: string;
    slug: string;
    displayName: string | null;
    sourceMode: "git" | "native";
    createdAt: string;
  }
  interface OrgPayload {
    org: {
      id: string;
      slug: string;
      displayName: string | null;
      isPersonal: boolean;
      memberCount: number;
    };
    projects: ProjectCard[];
  }

  let payload = $state<OrgPayload | null>(null);
  let loadError = $state<string | null>(null);

  async function loadOrg(): Promise<void> {
    loadError = null;
    try {
      const res = await fetch(`/api/dashboard/orgs/${encodeURIComponent(orgSlug)}`, {
        credentials: "same-origin",
      });
      if (res.status === 401) return;
      if (!res.ok) {
        loadError = `HTTP ${res.status.toString()}`;
        return;
      }
      payload = (await res.json()) as OrgPayload;
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(() => {
    void loadOrg();
  });

  const newProjectHref = $derived(localizeHref(`/dashboard/${orgSlug}/projects/new`));

  function memberCountLabel(n: number): string {
    if (n === 1) return m.dashboard_org_meta_member_one();
    return m.dashboard_org_meta_member_many({ count: n.toString() });
  }
</script>

<svelte:head>
  <title>{(payload?.org.displayName ?? orgSlug) + " · " + m.dashboard_meta_title()}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl">
  <!-- Slug + personal badge come from URL params / API. Slug stays visible
       across loading so the breadcrumb context is never blank. Title and
       member count get true skeletons (no slug-swap on the h1, no missing
       line on the member row) so the eye sees one consistent loading state
       instead of a slug that morphs into the displayName mid-render. -->
  <div class="mb-14">
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-muted-foreground/80 font-mono text-sm">{orgSlug}</span>
      {#if payload?.org.isPersonal}
        <span
          class="text-muted-foreground border-foreground/10 inline-block border px-2 py-0.5 font-mono text-[10px] tracking-tight uppercase"
        >
          {m.dashboard_org_badge_personal()}
        </span>
      {/if}
    </div>
    {#if payload}
      <h1
        class="text-foreground mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
      >
        {payload.org.displayName ?? payload.org.slug}
      </h1>
      <p class="text-muted-foreground mt-3 text-sm">
        {memberCountLabel(payload.org.memberCount)}
      </p>
    {:else if loadError === null}
      <!-- Title placeholder. Heights chosen to match the eventual h1's
           line-height: 36px (text-3xl) on mobile, 40px (text-4xl) on sm.
           Width picked to look like a real displayName (~14-18 chars), not
           a generic loading bar. -->
      <div class="bg-muted mt-4 h-9 w-56 animate-pulse sm:h-10 sm:w-64"></div>
      <!-- Member count placeholder. h-5 = 20px matches text-sm line-height
           so the line doesn't push content below it down when the real text
           lands. Width matches "1 member · Just you, for now." typical length. -->
      <div class="bg-muted mt-3 h-5 w-48 animate-pulse"></div>
    {/if}
  </div>

  {#if loadError !== null}
    <div
      class="border-destructive/40 bg-destructive/5 mb-8 flex items-center justify-between gap-4 border p-4"
    >
      <p class="text-destructive text-sm">{m.dashboard_load_error()}</p>
      <Button type="button" variant="outline" size="sm" onclick={() => void loadOrg()}>
        {m.dashboard_load_error_retry()}
      </Button>
    </div>
  {/if}

  <section class="mb-16">
    <div class="mb-6 flex items-baseline justify-between gap-4">
      <h2 class="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
        {m.dashboard_org_projects_heading()}
      </h2>
      <!-- Always render the New project button so its position is stable
           through loading -> loaded transitions. When the org has zero
           projects the centered empty state below still carries the primary
           CTA; the inline button reads as a redundant-but-consistent
           affordance rather than the only path forward. -->
      <Button href={newProjectHref} size="sm" class="h-9 cursor-pointer gap-1.5 px-3">
        <Plus class="size-4" />
        {m.dashboard_org_projects_new()}
      </Button>
    </div>

    {#if payload === null && loadError === null}
      <!-- Skeleton + real cards both lock to h-40 so the placeholder height
           exactly matches the rendered card height regardless of content
           length or sub-pixel rounding. With >1 projects the grid grows
           downward; with 0 projects the empty-state block replaces the grid. -->
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div class="border-foreground/15 bg-muted h-40 animate-pulse border p-6"></div>
      </div>
    {:else if payload?.projects.length === 0}
      <div
        class="border-foreground/10 bg-muted flex flex-col items-center border px-6 py-16 text-center sm:py-20"
      >
        <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
          {m.dashboard_org_projects_empty_eyebrow()}
        </p>
        <h3 class="text-foreground text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {m.dashboard_org_projects_empty_title()}
        </h3>
        <p class="text-muted-foreground mt-3 max-w-md leading-relaxed">
          {m.dashboard_org_projects_empty_body()}
        </p>
        <Button
          href={newProjectHref}
          size="lg"
          class="group mt-8 h-12 cursor-pointer gap-2 px-5 text-base"
        >
          <Plus class="size-4" />
          {m.dashboard_org_projects_empty_action()}
        </Button>
      </div>
    {:else if payload}
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {#each payload.projects as project (project.id)}
          <a
            href={localizeHref(`/dashboard/${orgSlug}/${project.slug}`)}
            class="bg-background border-foreground/15 hover:border-primary group flex h-40 flex-col border p-6 transition-colors"
          >
            <div class="mb-4 flex items-center justify-between gap-3">
              <span class="text-muted-foreground truncate font-mono text-sm">
                {project.slug}
              </span>
              <span
                class="text-muted-foreground border-border inline-block shrink-0 border px-2 py-0.5 font-mono text-xs tracking-tight uppercase"
              >
                {project.sourceMode === "git"
                  ? m.dashboard_org_project_source_git()
                  : m.dashboard_org_project_source_native()}
              </span>
            </div>
            <h3 class="text-foreground text-lg font-medium tracking-tight">
              {project.displayName ?? project.slug}
            </h3>
            <div class="mt-auto flex items-center justify-end pt-6">
              <ArrowRight
                class="text-muted-foreground/50 group-hover:text-primary size-4 transition-all group-hover:translate-x-0.5"
              />
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h2 class="text-foreground mb-4 text-xl font-semibold tracking-tight sm:text-2xl">
      {m.dashboard_org_members_heading()}
    </h2>
    {#if payload}
      <p class="text-muted-foreground text-sm">
        {memberCountLabel(payload.org.memberCount)}
        {#if payload.org.memberCount === 1}
          · {m.dashboard_org_members_only_you()}
        {/if}
        ·
        <a
          href={localizeHref(`/dashboard/${orgSlug}/settings`)}
          class="text-primary hover:underline"
        >
          {m.dashboard_settings_link()}
        </a>
      </p>
    {:else}
      <div class="bg-muted h-4 w-48 animate-pulse"></div>
    {/if}
  </section>
</div>
