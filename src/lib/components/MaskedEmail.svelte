<script lang="ts">
  import { m } from "$paraglide/messages";
  import { cn } from "$lib/utils";
  import { maskEmail } from "$lib/mask-email";

  // Email display with an anti-doxx default: shows a masked form (first two
  // local-part characters plus the TLD, with fixed-length bullets so the length
  // isn't leaked) so a screen recording or shoulder-surfer can't read or guess
  // it, while the owner still recognizes their own. Click to toggle the full
  // address. Pass `class` to restyle; cn() merges so a consumer's utilities win
  // over the defaults.
  let { email, class: className = "" }: { email: string; class?: string } = $props();

  let revealed = $state(false);
  const masked = $derived(maskEmail(email));
</script>

<button
  type="button"
  onclick={() => (revealed = !revealed)}
  title={revealed ? m.common_email_hide() : m.common_email_reveal()}
  class={cn(
    "hover:text-foreground cursor-pointer text-left break-all transition-colors select-text",
    className,
  )}
>
  {revealed ? email : masked}
</button>
