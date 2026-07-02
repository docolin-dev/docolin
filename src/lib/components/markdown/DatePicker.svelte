<script lang="ts">
  // The calendar behind `type=date` inputs: a shadcn Calendar in a Popover,
  // triggered from an icon inside the field. Values are ISO yyyy-mm-dd strings
  // both ways; typing in the field stays first-class, this is just the picker.
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import { parseDate, type DateValue } from "@internationalized/date";
  import * as Popover from "$lib/components/ui/popover";
  import { Calendar } from "$lib/components/ui/calendar";
  import { m } from "$paraglide/messages";

  interface Props {
    /** The field's current value (possibly not a valid date yet). */
    value: string;
    onPick: (iso: string) => void;
  }
  let { value, onPick }: Props = $props();

  let open = $state(false);
  let selected = $state<DateValue | undefined>(undefined);

  function openPicker(): void {
    // parseDate throws on anything but strict ISO; an unparseable field just
    // opens the calendar unseeded, there is no probe API.
    try {
      selected = parseDate(value.trim());
    } catch {
      selected = undefined;
    }
    open = true;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer transition-colors"
        onclick={openPicker}
        aria-label={m.doco_inputs_pick_date()}
        title={m.doco_inputs_pick_date()}
      >
        <CalendarIcon class="size-4" />
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-auto p-0" align="end">
    <Calendar
      type="single"
      captionLayout="dropdown"
      bind:value={selected}
      onValueChange={(picked: DateValue | undefined) => {
        if (picked !== undefined) {
          onPick(picked.toString());
          open = false;
        }
      }}
    />
  </Popover.Content>
</Popover.Root>
