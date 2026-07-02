<script lang="ts">
  // docolin's color picker for `type=color` inputs: a shadcn Popover holding the
  // classic saturation/value square (CSS gradients, no canvas), a hue slider (a
  // styled native range, so keyboard and screen-reader behavior come free), and
  // a format switcher driven by the shared conversion engine. The square's thumb
  // is keyboard-adjustable with arrow keys. Emits CSS color strings in whichever
  // of the big four formats is selected; defaults to the format the current
  // value already uses.
  import * as Popover from "$lib/components/ui/popover";
  import { m } from "$paraglide/messages";
  import {
    parseColor,
    formatAs,
    colorKind,
    rgbaToHsv,
    hsvToRgba,
    formatHex,
    type ColorKind,
    type Hsv,
  } from "$lib/markdown/color-convert";

  interface Props {
    /** The current field value (any supported CSS color, possibly invalid). */
    value: string;
    onPick: (color: string) => void;
  }
  let { value, onPick }: Props = $props();

  const FORMATS: ColorKind[] = ["hex", "rgb", "hsl", "oklch"];

  let open = $state(false);
  // The picker's own working state while open; seeded from the field value.
  let hsv = $state<Hsv>({ h: 130, s: 0.8, v: 0.7 });
  let format = $state<ColorKind>("hex");

  function openPicker(): void {
    const parsed = parseColor(value);
    if (parsed !== null) hsv = rgbaToHsv(parsed);
    format = colorKind(value) ?? "hex";
    open = true;
  }

  function emit(): void {
    onPick(formatAs(format, hsvToRgba(hsv, 1)));
  }

  const hueColor = $derived(formatHex(hsvToRgba({ h: hsv.h, s: 1, v: 1 }, 1)));
  const current = $derived(formatHex(hsvToRgba(hsv, 1)));

  // ----- The saturation/value square -----

  let areaEl = $state<HTMLElement | null>(null);

  function applyPointer(event: PointerEvent): void {
    if (areaEl === null) return;
    const rect = areaEl.getBoundingClientRect();
    const s = (event.clientX - rect.left) / rect.width;
    const v = 1 - (event.clientY - rect.top) / rect.height;
    hsv = { ...hsv, s: Math.min(1, Math.max(0, s)), v: Math.min(1, Math.max(0, v)) };
    emit();
  }

  function onAreaPointerDown(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    applyPointer(event);
  }
  function onAreaPointerMove(event: PointerEvent): void {
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
      applyPointer(event);
    }
  }

  // Arrow keys nudge the thumb; shift makes bigger steps.
  function onAreaKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.02;
    let { s, v } = hsv;
    if (event.key === "ArrowLeft") s -= step;
    else if (event.key === "ArrowRight") s += step;
    else if (event.key === "ArrowUp") v += step;
    else if (event.key === "ArrowDown") v -= step;
    else return;
    event.preventDefault();
    hsv = { ...hsv, s: Math.min(1, Math.max(0, s)), v: Math.min(1, Math.max(0, v)) };
    emit();
  }

  function onHueInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }): void {
    hsv = { ...hsv, h: Number(event.currentTarget.value) };
    emit();
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="border-border absolute top-1/2 left-2 size-5 -translate-y-1/2 cursor-pointer border"
        style:background={parseColor(value) !== null ? value : "transparent"}
        onclick={openPicker}
        aria-label={m.doco_inputs_pick_color()}
        title={m.doco_inputs_pick_color()}
      ></button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-60 p-3" align="start">
    <div class="flex flex-col gap-3">
      <!-- Saturation/value square: hue color under white (x) and black (y) ramps. -->
      <div
        bind:this={areaEl}
        class="focus-visible:ring-ring relative h-36 w-full cursor-crosshair touch-none focus-visible:ring-2 focus-visible:outline-none"
        style:background={`linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`}
        role="slider"
        aria-label={m.doco_inputs_pick_color()}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v * 100)}
        aria-valuetext={m.doco_inputs_area_value({
          saturation: String(Math.round(hsv.s * 100)),
          brightness: String(Math.round(hsv.v * 100)),
        })}
        tabindex="0"
        onpointerdown={onAreaPointerDown}
        onpointermove={onAreaPointerMove}
        onkeydown={onAreaKeydown}
      >
        <span
          class="pointer-events-none absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.6)]"
          style:left={`${String(hsv.s * 100)}%`}
          style:bottom={`${String(hsv.v * 100)}%`}
        ></span>
      </div>

      <!-- Hue: a native range styled as the rainbow strip (keyboard for free). -->
      <input
        type="range"
        min="0"
        max="360"
        step="1"
        value={hsv.h}
        oninput={onHueInput}
        class="doco-hue-slider"
        aria-label={m.doco_inputs_hue()}
      />

      <div class="flex items-center gap-2">
        <span class="border-border size-6 shrink-0 border" style:background={current}></span>
        <div class="flex flex-1 justify-end gap-1">
          {#each FORMATS as kind (kind)}
            <button
              type="button"
              class={`border px-1.5 py-0.5 font-mono text-[0.7rem] uppercase transition-colors ${
                format === kind
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={format === kind}
              onclick={() => {
                format = kind;
                emit();
              }}
            >
              {kind}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </Popover.Content>
</Popover.Root>
