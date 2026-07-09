<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
  import type { VariantProps } from "tailwind-variants";
  import { getToggleGroupCtx } from "./toggle-group.svelte";
  import { cn } from "$lib/utils.js";
  import { toggleVariants } from "$lib/components/ui/toggle/index.js";

  // Derived locally rather than imported as a type through the .svelte barrel,
  // which the lint TS program resolves to an error type. Mirrors toggle-group.svelte.
  type ToggleVariants = VariantProps<typeof toggleVariants>;

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    size,
    variant,
    ...restProps
  }: ToggleGroupPrimitive.ItemProps & ToggleVariants = $props();

  const ctx = getToggleGroupCtx();
</script>

<ToggleGroupPrimitive.Item
  bind:ref
  data-slot="toggle-group-item"
  data-variant={ctx.variant || variant}
  data-size={ctx.size || size}
  data-spacing={ctx.spacing}
  class={cn(
    "shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
    toggleVariants({
      variant: ctx.variant || variant,
      size: ctx.size || size,
    }),
    className,
  )}
  {value}
  {...restProps}
/>
