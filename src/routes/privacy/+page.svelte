<script lang="ts">
  import { localizeHref } from "$paraglide/runtime";

  // Always redirected to the privacy doco server-side (+page.server.ts); this
  // template is never rendered in practice. The link is a no-JS fallback.
</script>

<p class="p-8 text-sm">
  Redirecting to the <a class="underline" href={localizeHref("/docolin/docolin/privacy")}
    >privacy policy</a
  >.
</p>
