<script lang="ts">
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { session } from "$lib/client/session.svelte";
  import MaskedEmail from "$lib/components/MaskedEmail.svelte";

  // Tri-state account control shared between marketing and dashboard navbars.
  //  - signed in + onboarded → handle dropdown (Dashboard, Sign out)
  //  - WorkOS-authed but not onboarded → "Finish setup" CTA
  //  - anonymous → "Sign in" CTA
  //
  // Reads from the client-side session store so the surrounding HTML stays
  // identical for every reader and can be edge-cached. Until the store
  // resolves (`loaded === false`) we render nothing rather than flashing an
  // anonymous CTA at signed-in users.
</script>

{#if !session.loaded}
  <!-- Width reservation is handled by the navbar's auth slot wrapper, so the
       AccountMenu renders nothing here during loading. Anything visible would
       just fight with the slot's min-width and risk visual jitter. -->
{:else if session.value.dbUser}
  {@const dbUser = session.value.dbUser}
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
        {#if session.value.auth?.email}
          <MaskedEmail
            email={session.value.auth.email}
            class="text-muted-foreground text-xs font-normal"
          />
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
            <a href={localizeHref("/dashboard/admin")} {...props}>
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
{:else if session.value.auth}
  <Button href={localizeHref("/onboarding")} size="sm" variant="outline" class="h-9">
    {m.nav_finish_setup()}
  </Button>
{:else}
  <Button href={localizeHref("/signin")} size="sm" variant="outline" class="h-9">
    {m.nav_sign_in()}
  </Button>
{/if}
