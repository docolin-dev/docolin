<script lang="ts">
  import { localizeHref } from "$paraglide/runtime";

  // This route always redirects to the terms doco server-side (+page.server.ts),
  // so this template is never rendered in practice. The link is a no-JS fallback.
</script>

<p class="p-8 text-sm">
  Redirecting to the <a class="underline" href={localizeHref("/docolin/docolin/terms")}>terms</a>.
</p>
