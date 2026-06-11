<script lang="ts">
  import { m } from "$paraglide/messages";
  import { getLocale } from "$paraglide/runtime";
  import FileText from "@lucide/svelte/icons/file-text";
  import ProfileDocoRow from "./ProfileDocoRow.svelte";
  import { sharedKindPrefixLength } from "./kind-prefix";
  import { kindLabel } from "$lib/kind-label";
  import type { Profile, ProfileDoco } from "$lib/server/profile";

  // Person profile: the page a reader hits from an author byline, so it is a
  // credibility check first. Eye order: name (right place?), identity facts
  // (how long around?), participation line (active?), then their docos grouped
  // by topic, which is the actual answer to "what do they know about".
  interface Props {
    profile: Extract<Profile, { variant: "user" }>;
  }
  let { profile }: Props = $props();

  const name = $derived(profile.displayName ?? profile.handle);
  const sinceLabel = $derived(
    new Date(profile.since).toLocaleDateString(getLocale(), { year: "numeric", month: "long" }),
  );

  // Group by taxonomy root, biggest topic first: the group headings read as
  // the author's domains of expertise.
  const topicGroups = $derived.by(() => {
    const byRoot: Record<string, ProfileDoco[]> = {};
    for (const doco of profile.docos) {
      const root = doco.kind.split("/")[0];
      (byRoot[root] ??= []).push(doco);
    }
    return Object.entries(byRoot).sort((a, b) => b[1].length - a[1].length);
  });
</script>

<header class="mb-12">
  <h1 class="text-foreground text-3xl font-semibold tracking-tight">{name}</h1>
  <p class="text-muted-foreground mt-1 text-sm">
    <span class="font-mono">@{profile.handle}</span>
    <span aria-hidden="true">·</span>
    {m.profile_member_since({ date: sinceLabel })}
  </p>
  <p class="text-muted-foreground mt-3 text-sm">
    {profile.stats.docos === 1
      ? m.profile_stat_docos_one()
      : m.profile_stat_docos({ count: profile.stats.docos })}
    <span aria-hidden="true">·</span>
    {profile.stats.discussions === 1
      ? m.profile_stat_discussions_one()
      : m.profile_stat_discussions({ count: profile.stats.discussions })}
    <span aria-hidden="true">·</span>
    {profile.stats.replies === 1
      ? m.profile_stat_replies_one()
      : m.profile_stat_replies({ count: profile.stats.replies })}
    <span aria-hidden="true">·</span>
    {profile.stats.verifications === 1
      ? m.profile_stat_verifications_one()
      : m.profile_stat_verifications({ count: profile.stats.verifications })}
  </p>
</header>

{#if profile.docos.length === 0}
  <div class="border-foreground/12 flex flex-col items-center gap-2 border px-6 py-12">
    <FileText class="text-muted-foreground/50 size-6" aria-hidden="true" />
    <p class="text-foreground text-sm font-medium">{m.profile_empty_title()}</p>
    <p class="text-muted-foreground text-sm">{m.profile_empty_hint()}</p>
  </div>
{:else}
  <div class="flex flex-col gap-10">
    {#each topicGroups as [root, docos] (root)}
      <section>
        <h2 class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
          {kindLabel(root)}
        </h2>
        <ul class="border-foreground/12 divide-foreground/12 divide-y border">
          {#each docos as doco (doco.href)}
            <li>
              <ProfileDocoRow
                {doco}
                showProject
                dropKindSegments={sharedKindPrefixLength(docos.map((d) => d.kind))}
              />
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}
