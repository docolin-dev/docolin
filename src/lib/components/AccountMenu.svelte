<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  // Tri-state account control shared between marketing and dashboard navbars.
  //  - signed in + onboarded → handle dropdown (Dashboard, Sign out)
  //  - WorkOS-authed but not onboarded → "Finish setup" CTA
  //  - anonymous → "Sign in" CTA
</script>

{#if page.data.dbUser}
  {@const dbUser = page.data.dbUser}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline" size="sm" class="h-9 gap-1.5">
          <span class="font-mono text-xs">@{dbUser.handle}</span>
          <ChevronDown class="size-3.5" />
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="min-w-56" preventScroll={false}>
      <DropdownMenu.Label class="flex flex-col gap-0.5 py-2">
        <span class="font-mono text-sm font-medium">@{dbUser.handle}</span>
        {#if page.data.auth?.email}
          <span class="text-muted-foreground text-xs font-normal">
            {page.data.auth.email}
          </span>
        {/if}
      </DropdownMenu.Label>
      <DropdownMenu.Separator />
      <DropdownMenu.Item>
        {#snippet child({ props })}
          <a href={localizeHref("/dashboard")} {...props}>
            {m.nav_dashboard()}
          </a>
        {/snippet}
      </DropdownMenu.Item>
      {#if dbUser.isPlatformAdmin}
        <DropdownMenu.Item>
          {#snippet child({ props })}
            <a href={localizeHref("/dashboard/admin/claims")} {...props}>
              {m.nav_admin()}
            </a>
          {/snippet}
        </DropdownMenu.Item>
      {/if}
      <DropdownMenu.Separator />
      <DropdownMenu.Item>
        {#snippet child({ props })}
          <a href={localizeHref("/signout")} {...props}>
            {m.nav_sign_out()}
          </a>
        {/snippet}
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{:else if page.data.auth}
  <Button href={localizeHref("/onboarding")} size="sm" variant="outline" class="h-9">
    {m.nav_finish_setup()}
  </Button>
{:else}
  <Button href={localizeHref("/signin")} size="sm" variant="outline" class="h-9">
    {m.nav_sign_in()}
  </Button>
{/if}
