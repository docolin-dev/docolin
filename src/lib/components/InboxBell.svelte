<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import Bell from "@lucide/svelte/icons/bell";

  // Bell appears whenever the user is signed in + onboarded (page.data.dbUser
  // is set). Small primary dot in the corner when unreadCount > 0; no number
  // (per spec the bell is a presence indicator, not a counter; the inbox
  // page itself shows detail).
</script>

{#if page.data.dbUser}
  <Button
    href={localizeHref("/dashboard/inbox")}
    variant="ghost"
    size="sm"
    class="relative h-9 w-9 p-0"
    aria-label={m.nav_inbox_aria({
      count: page.data.inboxUnreadCount.toString(),
    })}
  >
    <Bell class="size-4" />
    {#if page.data.inboxUnreadCount > 0}
      <span
        aria-hidden="true"
        class="bg-primary ring-background absolute top-1.5 right-1.5 size-2 rounded-full ring-2"
      ></span>
    {/if}
  </Button>
{/if}
