<script lang="ts">
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import FileText from "@lucide/svelte/icons/file-text";
  import ProfileDocoRow from "./ProfileDocoRow.svelte";
  import { sharedKindPrefixLength } from "./kind-prefix";
  import type { Profile, ProfileProject } from "$lib/server/profile";

  // Org profile: visitors ask "what does this org maintain, and is it
  // official?". With several projects, projects are the unit (flagship first,
  // a preview of docos each). With ONE project, the grouping chrome would just
  // repeat the header (same name, same count), so the provenance link joins
  // the header and the docos render as one flat list.
  interface Props {
    profile: Extract<Profile, { variant: "org" }>;
  }
  let { profile }: Props = $props();

  const name = $derived(profile.displayName ?? profile.slug);
  // The slug only informs when it differs from the name (it is the URL the
  // visitor is already on); "Docolin" titled over "docolin" reads as a stutter.
  const showSlug = $derived(profile.slug.toLowerCase() !== name.toLowerCase());
  const sinceLabel = $derived(
    new Date(profile.since).toLocaleDateString(getLocale(), { year: "numeric", month: "long" }),
  );

  const single = $derived(profile.projects.length === 1 ? profile.projects[0] : null);
  const singleNameDiffers = $derived(
    single !== null && (single.displayName ?? single.slug).toLowerCase() !== name.toLowerCase(),
  );
  // Multi-project cards preview a handful; the count chip carries the total.
  const PREVIEW_ROWS = 5;

  function dropFor(project: ProfileProject): number {
    return sharedKindPrefixLength(project.docos.map((d) => d.kind));
  }

  function repoLabel(url: string): string {
    return url.startsWith("https://") ? url.slice("https://".length) : url;
  }
</script>

{#snippet syncedFrom(repoUrl: string)}
  <a
    href={repoUrl}
    rel="external noopener"
    target="_blank"
    class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
  >
    {m.profile_synced_from()}
    <span class="font-mono">{repoLabel(repoUrl)}</span>
    <ExternalLink class="size-3" aria-hidden="true" />
  </a>
{/snippet}

<header class="mb-12">
  <p class="text-muted-foreground mb-2 font-mono text-xs tracking-[0.18em] uppercase">
    {m.profile_org_eyebrow()}
  </p>
  <h1 class="text-foreground text-3xl font-semibold tracking-tight">{name}</h1>
  <p class="text-muted-foreground mt-1 text-sm">
    {#if showSlug}
      <span class="font-mono">{profile.slug}</span>
      <span aria-hidden="true">·</span>
    {/if}
    {m.profile_org_since({ date: sinceLabel })}
  </p>
  <p class="text-muted-foreground mt-3 text-sm">
    {#if profile.projects.length > 1}
      {m.profile_stat_projects({ count: profile.projects.length })}
      <span aria-hidden="true">·</span>
    {/if}
    {profile.docoCount === 1
      ? m.profile_stat_docos_one()
      : m.profile_stat_docos({ count: profile.docoCount })}
  </p>
</header>

{#if profile.projects.length === 0 || profile.docoCount === 0}
  <div class="border-foreground/12 flex flex-col items-center gap-2 border px-6 py-12">
    <FileText class="text-muted-foreground/50 size-6" aria-hidden="true" />
    <p class="text-foreground text-sm font-medium">{m.profile_empty_title()}</p>
    <p class="text-muted-foreground text-sm">{m.profile_empty_hint()}</p>
  </div>
{:else if single !== null}
  <!-- One project: no card repeating the header's name and count, but the
       provenance stays scoped to the project by sitting on the list itself,
       "everything below syncs from this repo". The project name only appears
       when it differs from the org's. -->
  <section class="border-foreground/12 border">
    {#if single.repoUrl !== null || singleNameDiffers}
      <div
        class="border-foreground/12 bg-muted/40 flex flex-wrap items-baseline justify-between gap-x-3 border-b px-4 py-2"
      >
        {#if singleNameDiffers}
          <span class="text-foreground text-sm font-medium">
            {single.displayName ?? single.slug}
          </span>
        {/if}
        {#if single.repoUrl !== null}
          <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
          {@render syncedFrom(single.repoUrl)}
        {/if}
      </div>
    {/if}
    <ul class="divide-foreground/12 divide-y">
      {#each single.docos as doco (doco.href)}
        <li><ProfileDocoRow {doco} dropKindSegments={dropFor(single)} /></li>
      {/each}
    </ul>
  </section>
{:else}
  <div class="flex flex-col gap-8">
    {#each profile.projects as project (project.slug)}
      <section class="border-foreground/12 border">
        <div class="border-foreground/12 bg-muted/40 border-b px-4 py-3">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-foreground truncate text-lg font-medium tracking-tight">
              {project.displayName ?? project.slug}
            </h2>
            <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
              {project.docoCount === 1
                ? m.profile_stat_docos_one()
                : m.profile_stat_docos({ count: project.docoCount })}
            </span>
          </div>
          {#if project.repoUrl}
            <div class="mt-0.5">
              <!-- eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -->
              {@render syncedFrom(project.repoUrl)}
            </div>
          {/if}
        </div>
        {#if project.docos.length > 0}
          <ul class="divide-foreground/12 divide-y">
            {#each project.docos.slice(0, PREVIEW_ROWS) as doco (doco.href)}
              <li><ProfileDocoRow {doco} dropKindSegments={dropFor(project)} /></li>
            {/each}
          </ul>
        {:else}
          <p class="text-muted-foreground px-4 py-6 text-sm">{m.profile_empty_title()}</p>
        {/if}
      </section>
    {/each}
  </div>
{/if}
