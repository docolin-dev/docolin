<script lang="ts">
  import { toast } from "svelte-sonner";
  import { m } from "$paraglide/messages";
  import { localizeHref } from "$paraglide/runtime";
  import { Button } from "$lib/components/ui/button";
  import Copy from "@lucide/svelte/icons/copy";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";

  let { endpoint }: { endpoint: string } = $props();

  function copyEndpoint(): void {
    void navigator.clipboard
      .writeText(endpoint)
      .then(() => {
        toast.success(m.mcp_landing_copied_toast());
      })
      .catch(() => undefined);
  }
</script>

<section class="px-6 pt-32 pb-20 sm:pt-40 sm:pb-24">
  <div class="mx-auto max-w-3xl">
    <p class="text-muted-foreground mb-4 font-mono text-xs tracking-[0.18em] uppercase">
      {m.mcp_landing_hero_eyebrow()}
    </p>
    <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
      {m.mcp_landing_hero_title()}
    </h1>
    <p class="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
      {m.mcp_landing_hero_subtitle()}
    </p>

    <div class="mt-10 flex flex-col gap-3">
      <div
        class="border-foreground/15 bg-muted/40 flex h-11 min-w-0 items-center gap-3 border px-3"
      >
        <code class="text-foreground min-w-0 flex-1 truncate font-mono text-sm">{endpoint}</code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-8 shrink-0 gap-2"
          onclick={copyEndpoint}
        >
          <Copy class="size-4" />
          {m.mcp_landing_copy()}
        </Button>
      </div>
      <div class="flex flex-col gap-3 sm:flex-row">
        <Button href="#connect" size="lg" class="group h-11 gap-2 px-5">
          {m.mcp_landing_hero_cta_connect()}
          <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
        <Button href={localizeHref("/dashboard/mcp")} variant="outline" size="lg" class="h-11 px-5">
          {m.mcp_landing_hero_cta_token()}
        </Button>
      </div>
    </div>
    <p class="text-muted-foreground/80 mt-3 text-xs">{m.mcp_landing_hero_cta_note()}</p>
  </div>
</section>
