<script lang="ts">
  import type { Component } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate } from "$app/navigation";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { resetMode, setMode, userPrefersMode } from "mode-watcher";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import MaskedEmail from "$lib/components/MaskedEmail.svelte";
  import Menu from "@lucide/svelte/icons/menu";
  import CircleUser from "@lucide/svelte/icons/circle-user";
  import Inbox from "@lucide/svelte/icons/inbox";
  import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
  import User from "@lucide/svelte/icons/user";
  import Shield from "@lucide/svelte/icons/shield";
  import LogOut from "@lucide/svelte/icons/log-out";
  import LogIn from "@lucide/svelte/icons/log-in";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Github from "$lib/components/icons/Github.svelte";
  import { session } from "$lib/client/session.svelte";

  // The one mobile menu, shared by every navbar so the control never moves and
  // its contents never change meaning between surfaces.
  //
  //  - One trigger, always in the same slot: the profile icon when signed in
  //    (carrying the unread dot, so notifications read without opening it), a
  //    burger when signed out. Never both, never a burger while signed in.
  //  - It opens a BOTTOM sheet: the trigger must live in the bar, but the
  //    contents belong in the thumb arc.
  //  - The bottom-most slot is the easiest tap in the sheet, so it goes to the
  //    action the visitor came to perform. For an anonymous visitor that is Sign
  //    in (a filled CTA); for a signed-in user it is the settings strip they
  //    actually touch (theme). Sign out is rare and annoying to misfire, so it
  //    sits up in the account group as a quiet row, never in the thumb zone.
  //  - Stable anchors across surfaces: the account group is always directly
  //    under the header, the settings strip is always last.
  //
  // Desktop keeps the standalone theme/language/inbox widgets and the AccountMenu
  // dropdown in the bar; this whole component is md:hidden.
  interface NavLink {
    href: string;
    label: string;
    icon: Component;
  }
  let {
    navLinks = [],
    githubHref = null,
  }: {
    /** Site nav rows (marketing only). Absent on the app navbars. */
    navLinks?: NavLink[];
    /** External repo link, rendered under the nav section when provided. */
    githubHref?: string | null;
  } = $props();

  let open = $state(false);
  afterNavigate(() => {
    open = false;
  });

  const returnTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));
  const dbUser = $derived(session.value.dbUser);
  const hasUnread = $derived(session.value.inboxUnreadCount > 0);

  type ThemeMode = "light" | "dark" | "system";
  // The group's value has to be two-way (`bind:value`): a single-select
  // ToggleGroup deselects when its active item is tapped again and writes "" into
  // the bound value, and passing `value` one-way would let the primitive's copy
  // drift from the real mode with nothing to push it back.
  //
  // This is a WRITABLE $derived (Svelte 5.25+, and this repo is on 5.55): reading
  // it tracks `userPrefersMode` so an external theme change still updates the
  // group, and assigning to it overrides that value until a dependency changes,
  // which is exactly what the deselect needs. Assignment is NOT a no-op. The
  // $state + $effect spelling of the same thing is rejected by our own lint rule
  // `svelte/prefer-writable-derived`.
  let themeMode = $derived<ThemeMode>(userPrefersMode.current);
  function onThemeChange(value: string): void {
    if (value === "system") resetMode();
    else if (value === "light" || value === "dark") setMode(value);
    // The theme always has a value: restore it so a deselect can't blank the group.
    themeMode = userPrefersMode.current;
  }

  const ROW =
    "hover:bg-foreground/5 flex min-h-11 items-center gap-3 px-2 text-base transition-colors";
</script>

<!-- The trigger is always rendered: its box is a fixed 44px, so swapping the
     glyph once the session resolves shifts nothing, and there is never a state
     where the navbar shows an empty hole. Before the session loads we show the
     anonymous burger, matching the anonymous snapshot the cached HTML carries. -->
<div class="md:hidden">
  <button
    type="button"
    onclick={() => (open = true)}
    class="text-muted-foreground hover:text-foreground relative inline-flex size-11 cursor-pointer items-center justify-center transition-colors"
    aria-label={dbUser ? m.nav_account_menu() : m.nav_menu()}
  >
    {#if dbUser}
      <CircleUser class="size-5" />
      {#if hasUnread}
        <!-- The standalone InboxBell is md+ only, so this trigger is the only
             unread signal on mobile: announce it, don't just paint a dot. -->
        <span class="sr-only">{m.nav_unread_notifications()}</span>
        <span
          aria-hidden="true"
          class="bg-primary ring-background absolute top-2 right-2 size-2 rounded-full ring-2"
        ></span>
      {/if}
    {:else}
      <Menu class="size-5" />
    {/if}
  </button>
</div>

<Sheet.Root bind:open>
  <Sheet.Content
    side="bottom"
    class="max-h-[85dvh] gap-3 overflow-y-auto rounded-none px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
  >
    <Sheet.Header class="gap-1 px-0 py-0">
      <Sheet.Title class="font-mono text-base">
        {dbUser ? `@${dbUser.handle}` : m.nav_menu()}
      </Sheet.Title>
      {#if dbUser && session.value.auth?.email}
        <MaskedEmail email={session.value.auth.email} class="text-muted-foreground text-xs" />
      {/if}
    </Sheet.Header>

    {#if dbUser}
      <!-- Always directly under the header, on every surface. -->
      <nav class="border-foreground/10 flex flex-col border-t pt-2">
        <a href={localizeHref("/dashboard/inbox")} class={ROW}>
          <Inbox class="size-4 shrink-0" />
          {m.inbox_nav_inbox()}
          {#if hasUnread}
            <span aria-hidden="true" class="bg-primary ml-auto size-2 rounded-full"></span>
          {/if}
        </a>
        <a href={localizeHref("/dashboard")} class={ROW}>
          <LayoutDashboard class="size-4 shrink-0" />
          {m.nav_dashboard()}
        </a>
        <a href={localizeHref("/dashboard/account")} class={ROW}>
          <User class="size-4 shrink-0" />
          {m.nav_account()}
        </a>
        {#if dbUser.isPlatformAdmin}
          <a href={localizeHref("/dashboard/admin")} class={ROW}>
            <Shield class="size-4 shrink-0" />
            {m.nav_admin()}
          </a>
        {/if}
        <!-- Rare and irreversible-feeling, so it stays a quiet row here rather
             than taking the sheet's most reachable slot. -->
        <a href={localizeHref("/signout")} class="{ROW} text-muted-foreground">
          <LogOut class="size-4 shrink-0" />
          {m.nav_sign_out()}
        </a>
      </nav>
    {/if}

    {#if navLinks.length > 0 || githubHref !== null}
      <nav class="border-foreground/10 flex flex-col border-t pt-2">
        {#each navLinks as link (link.href)}
          {@const Icon = link.icon}
          <a href={localizeHref(link.href)} class={ROW}>
            <Icon class="size-4 shrink-0" />
            {link.label}
          </a>
        {/each}
        {#if githubHref !== null}
          <a
            href={githubHref}
            target="_blank"
            rel="noopener noreferrer"
            class={ROW}
            aria-label={m.nav_github_aria()}
          >
            <Github class="size-4 shrink-0" />
            GitHub
            <ExternalLink class="text-muted-foreground ml-auto size-3.5" />
          </a>
        {/if}
      </nav>
    {/if}

    <!-- Settings strip: one row instead of four. The active theme and locale are
         carried by the primitives themselves, so no headings are needed. -->
    <div class="border-foreground/10 flex items-center justify-between gap-3 border-t pt-3">
      <ToggleGroup.Root type="single" bind:value={themeMode} onValueChange={onThemeChange}>
        <ToggleGroup.Item value="light" aria-label={m.common_theme_light()} class="size-11">
          <Sun class="size-4" />
        </ToggleGroup.Item>
        <ToggleGroup.Item value="dark" aria-label={m.common_theme_dark()} class="size-11">
          <Moon class="size-4" />
        </ToggleGroup.Item>
        <ToggleGroup.Item value="system" aria-label={m.common_theme_system()} class="size-11">
          <Monitor class="size-4" />
        </ToggleGroup.Item>
      </ToggleGroup.Root>
      <LanguageSwitcher />
    </div>

    {#if !dbUser}
      <!-- Bottom-most = easiest tap. For an anonymous visitor this is the whole
           reason they opened the menu. -->
      <a
        href={session.value.auth
          ? localizeHref(`/onboarding?returnTo=${returnTo}`)
          : localizeHref(`/signin?returnTo=${returnTo}`)}
        class="bg-primary text-primary-foreground hover:bg-primary/90 flex min-h-11 w-full items-center justify-center gap-2 px-4 text-sm font-medium transition-colors"
      >
        <LogIn class="size-4" />
        {session.value.auth ? m.nav_finish_setup() : m.nav_sign_in()}
      </a>
    {/if}
  </Sheet.Content>
</Sheet.Root>
