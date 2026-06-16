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

<section
  id="connect"
  class="bg-muted/20 border-foreground/10 scroll-mt-24 border-y px-6 py-20 sm:py-24"
>
  <div class="mx-auto max-w-3xl">
    <p class="text-muted-foreground mb-3 font-mono text-xs tracking-[0.18em] uppercase">
      {m.mcp_landing_connect_eyebrow()}
    </p>
    <h2 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
      {m.mcp_landing_connect_title()}
    </h2>

    <ol class="mt-12 flex flex-col gap-10">
      <li class="flex gap-5">
        <span
          class="border-foreground/20 text-foreground/70 flex size-8 shrink-0 items-center justify-center border font-mono text-sm"
        >
          1
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="text-lg font-medium tracking-tight">{m.mcp_landing_connect_step1_title()}</h3>
          <p class="text-muted-foreground mt-2 leading-relaxed">
            {m.mcp_landing_connect_step1_body()}
          </p>
          <div
            class="border-foreground/15 bg-background mt-4 flex items-center gap-3 border px-3 py-1.5"
          >
            <code class="text-foreground min-w-0 flex-1 truncate font-mono text-sm">
              {endpoint}
            </code>
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
          <a
            href={localizeHref("/docolin/docolin/mcp/connect")}
            class="text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {m.mcp_connect_guide_link()}
            <ArrowRight class="size-4" />
          </a>
        </div>
      </li>

      <li class="flex gap-5">
        <span
          class="border-foreground/20 text-foreground/70 flex size-8 shrink-0 items-center justify-center border font-mono text-sm"
        >
          2
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="text-lg font-medium tracking-tight">{m.mcp_landing_connect_step2_title()}</h3>
          <p class="text-muted-foreground mt-2 leading-relaxed">
            {m.mcp_landing_connect_step2_body()}
          </p>
        </div>
      </li>

      <li class="flex gap-5">
        <span
          class="border-foreground/20 text-foreground/70 flex size-8 shrink-0 items-center justify-center border font-mono text-sm"
        >
          3
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="text-lg font-medium tracking-tight">{m.mcp_landing_connect_step3_title()}</h3>
          <p class="text-muted-foreground mt-2 leading-relaxed">
            {m.mcp_landing_connect_step3_body()}
          </p>
          <a
            href={localizeHref("/dashboard/mcp")}
            class="text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {m.mcp_landing_connect_step3_link()}
            <ArrowRight class="size-4" />
          </a>
        </div>
      </li>
    </ol>
  </div>
</section>
