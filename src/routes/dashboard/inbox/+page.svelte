<script lang="ts">
  import { m } from "$paraglide/messages";
  import InboxList from "$lib/components/InboxList.svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.inbox_meta_title()} · docolin</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<h1 class="text-foreground mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">
  {m.inbox_heading()}
</h1>

<InboxList
  messages={data.messages}
  bucket={data.bucket}
  emptyTitle={m.inbox_empty_title()}
  emptyBody={m.inbox_empty_body()}
/>
