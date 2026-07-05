<script lang="ts">
  // Interstitial for links that leave docolin for a site we do not control.
  // The render pipeline stamps `data-leave` on external, non-first-party links in
  // authored content (docos, discussions, previews); chrome/marketing anchors are
  // never marked. One delegated listener catches a plain left-click on such a
  // link, shows the full destination (host emphasized) and asks before opening.
  // Mounted once in the root layout. Progressive enhancement: with JS off the
  // link just opens (already rel="noopener noreferrer"); this is a trust
  // affordance, not a security boundary.
  import { onMount } from "svelte";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$paraglide/messages";

  interface Target {
    url: string;
    before: string; // scheme + "//" (+ any userinfo)
    host: string;
    after: string; // path + query + hash
  }

  let target = $state<Target | null>(null);

  // Splits a URL so the host can be emphasized in place, so a long or obfuscated
  // link still shows WHERE it goes. The link was already validated as http(s) by
  // the renderer, so URL parsing succeeds; the fallback keeps us safe regardless.
  // Protocol-relative links (//host/x) are normalized the same way the renderer
  // does, so the host is emphasized rather than the whole string.
  function describe(url: string): Target {
    const normalized = url.startsWith("//") ? `https:${url}` : url;
    if (!URL.canParse(normalized)) return { url, before: "", host: url, after: "" };
    const parsed = new URL(normalized);
    const hostAt = url.indexOf(parsed.host);
    if (hostAt === -1) return { url, before: "", host: parsed.host, after: "" };
    return {
      url,
      before: url.slice(0, hostAt),
      host: parsed.host,
      after: url.slice(hostAt + parsed.host.length),
    };
  }

  function onClick(event: MouseEvent): void {
    // Never hijack the browser's own "open in new/background tab" gestures.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[data-leave]");
    if (link === null) return;
    const url = link.getAttribute("href");
    if (url === null) return;
    event.preventDefault();
    target = describe(url);
  }

  function proceed(): void {
    if (target === null) return;
    window.open(target.url, "_blank", "noopener,noreferrer");
    target = null;
  }

  onMount(() => {
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  });
</script>

<Dialog.Root
  open={target !== null}
  onOpenChange={(open) => {
    if (!open) target = null;
  }}
>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{m.common_leave_title()}</Dialog.Title>
      <Dialog.Description>{m.common_leave_description()}</Dialog.Description>
    </Dialog.Header>

    {#if target !== null}
      <div class="bg-muted overflow-x-auto border p-3 font-mono text-sm break-all">
        <span class="text-muted-foreground">{target.before}</span><span
          class="text-foreground font-semibold">{target.host}</span
        ><span class="text-muted-foreground">{target.after}</span>
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (target = null)}>
        {m.common_leave_cancel()}
      </Button>
      <Button onclick={proceed}>
        <ExternalLink class="size-4" />
        {m.common_leave_continue()}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
