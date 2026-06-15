<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$paraglide/messages";
  import { getLocale, isLocale, localizeHref, locales } from "$paraglide/runtime";
  import * as Select from "$lib/components/ui/select";

  const LOCALE_LABELS: Record<string, string> = { en: "English", de: "Deutsch", fr: "Français" };

  // Hard navigate (not goto) because the reroute hook collapses /de/foo and
  // /foo onto the same route, so SvelteKit would see no route change and
  // skip re-rendering message strings. A full page load forces SSR with the
  // new locale.
  function changeLocale(value: string): void {
    if (!isLocale(value) || value === getLocale()) return;
    window.location.href = localizeHref(page.url.pathname, { locale: value });
  }
</script>

<Select.Root type="single" value={getLocale()} onValueChange={changeLocale}>
  <Select.Trigger class="h-9! w-auto" aria-label={m.nav_lang_aria()}>
    <span class="font-mono text-xs tracking-tight uppercase">{getLocale()}</span>
  </Select.Trigger>
  <Select.Content align="end" preventScroll={false}>
    {#each locales as locale (locale)}
      <Select.Item value={locale} label={LOCALE_LABELS[locale] ?? locale}>
        {LOCALE_LABELS[locale] ?? locale}
      </Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
