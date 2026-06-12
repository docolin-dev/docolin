<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import DocoViewerNavbar from "$lib/components/DocoViewerNavbar.svelte";
  import UserProfile from "$lib/components/profile/UserProfile.svelte";
  import OrgProfile from "$lib/components/profile/OrgProfile.svelte";
  import { SITE_URL } from "$lib/site";
  import type { PageProps } from "./$types";

  // Public profile shell: head metadata + variant dispatch. The two variants
  // answer different visitor questions (see the components), so they are
  // separate components rather than one page with mode switches.
  let { data }: PageProps = $props();
  const profile = $derived(data.profile);

  const name = $derived(
    profile.variant === "user"
      ? (profile.displayName ?? profile.handle)
      : (profile.displayName ?? profile.slug),
  );

  const metaDescription = $derived(
    profile.variant === "user"
      ? m.profile_meta_description_user({ name })
      : m.profile_meta_description_org({ name }),
  );

  const pageUrl = $derived(`${SITE_URL}${page.url.pathname}`);
  const jsonLd = $derived({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity:
      profile.variant === "user"
        ? { "@type": "Person", name, alternateName: profile.handle, url: pageUrl }
        : { "@type": "Organization", name, url: pageUrl },
  });
  // User-controlled names land in this JSON; escape `<` so a crafted display
  // name can never close the script tag.
  /* eslint-disable no-useless-escape */
  const jsonLdHtml = $derived(
    `<script type="application/ld+json">${JSON.stringify(jsonLd).split("<").join("\\u003c")}<\/script>`,
  );
  /* eslint-enable no-useless-escape */
</script>

<svelte:head>
  <title>{name} · docolin</title>
  <meta name="description" content={metaDescription} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- JSON.stringify of our own data, `<` escaped above -->
  {@html jsonLdHtml}
</svelte:head>

<DocoViewerNavbar kindSegments={[]} />

<main class="mx-auto w-full max-w-3xl px-6 pt-24 pb-16">
  {#if profile.variant === "user"}
    <UserProfile {profile} />
  {:else}
    <OrgProfile {profile} />
  {/if}
</main>
