<script lang="ts">
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import { resetMode, setMode } from "mode-watcher";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$paraglide/messages";

  // Light/dark/system menu. mode-watcher toggles `.dark` on <html> globally;
  // "system" (resetMode) follows the OS. The frontpage opts back out via .light.
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon" aria-label={m.common_theme_toggle()}>
        <Sun class="size-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon
          class="absolute size-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
        />
        <span class="sr-only">{m.common_theme_toggle()}</span>
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" preventScroll={false}>
    <DropdownMenu.Item
      onclick={() => {
        setMode("light");
      }}>{m.common_theme_light()}</DropdownMenu.Item
    >
    <DropdownMenu.Item
      onclick={() => {
        setMode("dark");
      }}>{m.common_theme_dark()}</DropdownMenu.Item
    >
    <DropdownMenu.Item
      onclick={() => {
        resetMode();
      }}>{m.common_theme_system()}</DropdownMenu.Item
    >
  </DropdownMenu.Content>
</DropdownMenu.Root>
