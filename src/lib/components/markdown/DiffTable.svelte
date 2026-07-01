<script lang="ts">
  // The auto-diff viewer: header (title + controls) and the computed diff, rendered
  // from the source code blocks' shiki tokens so it keeps the same syntax colors and
  // background. MarkdownDiff renders this inline (compact/unified, with an expand
  // button) and again inside a near-fullscreen dialog (split + full controls). Changed
  // rows get a 2px accent border + a soft tint; the exact changed spans get a stronger
  // highlight painted on top of the syntax colors. Long lines soft-wrap. Only the
  // word-highlight preference persists.
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import X from "@lucide/svelte/icons/x";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import TextSelect from "@lucide/svelte/icons/text-select";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import {
    diffToRows,
    diffToRowsAligned,
    refineLine,
    alignChanges,
    changedRanges,
    mergeHighlight,
    type DiffRow,
    type LineTokens,
  } from "$lib/markdown/diff-engine";
  import { diffLineKey, type DiffSide } from "$lib/markdown/diff-select";

  interface Props {
    beforeLines: LineTokens[];
    afterLines: LineTokens[];
    title?: string;
    lang: string;
    bgLight: string;
    bgDark: string;
    beforeStart: number;
    afterStart: number;
    /** Selected line keys ("{side}-{absolute line}"), owned by MarkdownDiff so the
     *  inline and modal copies share one selection. */
    selected: ReadonlySet<string>;
    onSelectLine: (side: DiffSide, line: number, opts: { shift: boolean; toggle: boolean }) => void;
    /** Inline mode: pinned to unified (the stacked view that fits a narrow doco
     *  column), no layout toggle. Split + the full toolbar live in the expanded
     *  modal, which has the width for them. */
    compact?: boolean;
    onExpand?: () => void;
    onClose?: () => void;
  }
  let {
    beforeLines,
    afterLines,
    title = "",
    lang,
    bgLight,
    bgDark,
    beforeStart,
    afterStart,
    selected,
    onSelectLine,
    compact = false,
    onExpand,
    onClose,
  }: Props = $props();

  type Layout = "split" | "unified";
  const STORE_KEY = "docolin:diff-view";

  function loadWords(): boolean {
    // localStorage access can throw under strict privacy settings; fall back to the
    // default rather than break the viewer.
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw !== null) return (JSON.parse(raw) as { words?: boolean }).words !== false;
    } catch {
      /* ignore */
    }
    return true;
  }

  // Layout is not persisted: inline is always unified, and the modal always opens on
  // split (the reason to expand is the width for it); the toggle switches the current
  // view only. Just the word-highlight choice persists.
  let layout = $state<Layout>("split");
  let words = $state(loadWords());
  let showMoves = $state(true);
  let swapped = $state(false);
  // Selection mode (the header's select button, mirroring the code blocks): while
  // on, whole rows respond to clicks. The gutter numbers work either way.
  let selecting = $state(false);
  // The move currently hovered, so its paired block (both sides of the relocation)
  // lights up together, answering "where did this go?" when several blocks move.
  let hoveredMove = $state<number | null>(null);
  // The row under the cursor while in selection mode; drives the hover preview as
  // plain state (a class-variant hover can lose to a row's own tint classes).
  let hoveredRow = $state<number | null>(null);

  // Reading `compact` in a $derived is a reactive context (no "captures initial value"
  // warning); inline forces unified, the modal follows the toggle.
  const effectiveLayout = $derived<Layout>(compact ? "unified" : layout);

  $effect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ words }));
    } catch {
      /* ignore */
    }
  });

  const sides = $derived(
    swapped ? { b: afterLines, a: beforeLines } : { b: beforeLines, a: afterLines },
  );
  // Gutter start per side, swapped alongside the content.
  const starts = $derived(
    swapped ? { b: afterStart, a: beforeStart } : { b: beforeStart, a: afterStart },
  );
  // The ACTUAL side each displayed gutter addresses (selection is by actual side +
  // absolute line, so a shared link means the same lines whatever the swap state).
  const sideB = $derived<DiffSide>(swapped ? "a" : "b");
  const sideA = $derived<DiffSide>(swapped ? "b" : "a");
  const sideName = (side: DiffSide): string => (side === "b" ? "before" : "after");
  // Gutter width scales with the widest line number so a high start does not clip.
  const gutterDigits = $derived(
    String(Math.max(beforeStart + beforeLines.length - 1, afterStart + afterLines.length - 1, 1))
      .length,
  );
  // Different linenums starts are the author saying "offset windows of the same
  // file": lines then pair by absolute line number (positional), not by content.
  // Equal starts get the normal content diff (vscode-diff, with move detection).
  const positional = $derived(beforeStart !== afterStart);
  const rows = $derived(
    positional
      ? diffToRowsAligned(
          sides.b.map((line) => line.text),
          sides.a.map((line) => line.text),
          starts.b,
          starts.a,
        )
      : diffToRows(
          sides.b.map((line) => line.text),
          sides.a.map((line) => line.text),
        ),
  );

  // Pairs a change run's removed lines with its added lines: positionally (same
  // absolute number) in positional mode, by content similarity otherwise. Indices
  // are relative to the runs; `i`/`delEnd`/`addEnd` bound them within `rows`.
  function runPairs(i: number, delEnd: number, addEnd: number): [number, number][] {
    if (!positional) {
      return alignChanges(
        rows.slice(i, delEnd).map((r) => r.text),
        rows.slice(delEnd, addEnd).map((r) => r.text),
      );
    }
    const pairs: [number, number][] = [];
    for (let d = i; d < delEnd; d++) {
      const delBefore = rows[d].before;
      if (delBefore === null) continue;
      const absLine = delBefore + starts.b;
      for (let a = delEnd; a < addEnd; a++) {
        const addAfter = rows[a].after;
        if (addAfter !== null && addAfter + starts.a === absLine) {
          pairs.push([d - i, a - delEnd]);
          break;
        }
      }
    }
    return pairs;
  }

  // Per-row render pieces: the line's shiki tokens, split at the changed-character
  // boundaries so the exact intra-line change gets a highlight on top of the syntax
  // colors. Only paired edited lines carry a change; a pure add/remove has none.
  const rowSegs = $derived.by(() => {
    const ranges: Record<number, [number, number][]> = {};
    if (words) {
      let i = 0;
      while (i < rows.length) {
        if (rows[i].type === "del") {
          let delEnd = i;
          while (delEnd < rows.length && rows[delEnd].type === "del") delEnd++;
          let addEnd = delEnd;
          while (addEnd < rows.length && rows[addEnd].type === "add") addEnd++;
          for (const [d, a] of runPairs(i, delEnd, addEnd)) {
            const { del, add } = refineLine(rows[i + d].text, rows[delEnd + a].text, "word");
            ranges[i + d] = changedRanges(del, "del");
            ranges[delEnd + a] = changedRanges(add, "add");
          }
          i = addEnd;
        } else {
          i++;
        }
      }
    }
    return rows.map((row, i) => {
      const line =
        row.type === "add"
          ? row.after !== null
            ? sides.a[row.after]
            : undefined
          : row.before !== null
            ? sides.b[row.before]
            : undefined;
      return mergeHighlight(line?.tokens ?? [], ranges[i] ?? []);
    });
  });

  // Split layout: same rows show on both sides; a change run pairs its removed lines
  // (left) with its added lines (right) by similarity; a leftover pairs with a blank.
  interface SplitCell {
    index: number;
    no: string;
    /** Which actual side this cell's gutter addresses, and its absolute line. */
    side: DiffSide;
    line: number | null;
  }
  interface SplitRow {
    left: SplitCell | null;
    right: SplitCell | null;
  }
  const lineNo = (n: number | null, start: number): string => (n === null ? "" : String(n + start));
  const abs = (n: number | null, start: number): number | null => (n === null ? null : n + start);
  const splitRows = $derived.by(() => {
    const out: SplitRow[] = [];
    let i = 0;
    while (i < rows.length) {
      if (rows[i].type === "same") {
        out.push({
          left: {
            index: i,
            no: lineNo(rows[i].before, starts.b),
            side: sideB,
            line: abs(rows[i].before, starts.b),
          },
          right: {
            index: i,
            no: lineNo(rows[i].after, starts.a),
            side: sideA,
            line: abs(rows[i].after, starts.a),
          },
        });
        i++;
        continue;
      }
      let delEnd = i;
      while (delEnd < rows.length && rows[delEnd].type === "del") delEnd++;
      let addEnd = delEnd;
      while (addEnd < rows.length && rows[addEnd].type === "add") addEnd++;
      const delCount = delEnd - i;
      const addCount = addEnd - delEnd;
      const delToAdd: Record<number, number> = {};
      const addToDel: Record<number, number> = {};
      for (const [d, a] of runPairs(i, delEnd, addEnd)) {
        delToAdd[d] = a;
        addToDel[a] = d;
      }
      const leftCell = (d: number): SplitCell => ({
        index: i + d,
        no: lineNo(rows[i + d].before, starts.b),
        side: sideB,
        line: abs(rows[i + d].before, starts.b),
      });
      const rightCell = (a: number): SplitCell => ({
        index: delEnd + a,
        no: lineNo(rows[delEnd + a].after, starts.a),
        side: sideA,
        line: abs(rows[delEnd + a].after, starts.a),
      });
      let d = 0;
      let a = 0;
      while (d < delCount || a < addCount) {
        if (d < delCount && delToAdd[d] === a) {
          out.push({ left: leftCell(d), right: rightCell(a) });
          d++;
          a++;
        } else if (a < addCount && !(a in addToDel)) {
          out.push({ left: null, right: rightCell(a) });
          a++;
        } else if (d < delCount && !(d in delToAdd)) {
          out.push({ left: leftCell(d), right: null });
          d++;
        } else if (a < addCount) {
          out.push({ left: null, right: rightCell(a) });
          a++;
        } else {
          out.push({ left: leftCell(d), right: null });
          d++;
        }
      }
      i = addEnd;
    }
    return out;
  });

  // Whether any of the row's lines is in the shared selection (a same row can be
  // picked via either gutter).
  function isRowSelected(row: DiffRow): boolean {
    return (
      (row.before !== null && selected.has(diffLineKey(sideB, row.before + starts.b))) ||
      (row.after !== null && selected.has(diffLineKey(sideA, row.after + starts.a)))
    );
  }

  // A selected line takes the primary accent border (visible over any tint, the
  // code blocks' rust bar); otherwise the border shows the row type.
  function tintBorder(row: DiffRow): string {
    if (isRowSelected(row)) return "border-primary";
    if (row.moved && showMoves) return "border-sky-500/60";
    if (row.type === "add") return "border-emerald-500/60";
    if (row.type === "del") return "border-red-500/60";
    return "border-transparent";
  }
  // Light mode needs a stronger tint to read the hue on white; dark keeps the original
  // ~7% over the shiki background. A hovered move brightens both of its sides (eased in
  // via the row's transition-colors) so a relocation is traceable when several moved.
  // Selection and its hover preview use the code blocks' primary tint and are decided
  // here as plain state, so they always beat the row's own tint.
  function tintBg(row: DiffRow, index: number): string {
    if (isRowSelected(row)) return "bg-primary/25";
    if (selecting && hoveredRow === index) return "bg-primary/15";
    if (row.moved && showMoves)
      return row.moveId === hoveredMove
        ? "bg-sky-500/30 dark:bg-sky-500/20"
        : "bg-sky-500/[0.15] dark:bg-sky-500/[0.07]";
    if (row.type === "add") return "bg-emerald-500/[0.15] dark:bg-emerald-500/[0.07]";
    if (row.type === "del") return "bg-red-500/[0.15] dark:bg-red-500/[0.07]";
    return "";
  }
  function sign(row: DiffRow): string {
    if (row.moved && showMoves) return "±";
    if (row.type === "add") return "+";
    if (row.type === "del") return "-";
    return "";
  }
  function signColor(row: DiffRow): string {
    if (row.moved && showMoves) return "text-sky-600 dark:text-sky-400";
    if (row.type === "add") return "text-emerald-600 dark:text-emerald-400";
    if (row.type === "del") return "text-red-600 dark:text-red-400";
    return "";
  }
  // The exact-change highlight painted on top of the syntax colors; matches the row.
  function highlightClass(row: DiffRow): string {
    if (row.moved && showMoves) return "bg-sky-500/40 dark:bg-sky-500/25";
    if (row.type === "add") return "bg-emerald-500/40 dark:bg-emerald-500/25";
    if (row.type === "del") return "bg-red-500/40 dark:bg-red-500/25";
    return "";
  }

  // Selection-mode clicks. A split cell selects its own side; a unified row picks
  // its natural side (an add or unchanged row by its after number, a removed row by
  // its before number). Clicks on the gutter buttons are theirs, not the row's.
  function cellClick(side: DiffSide, line: number | null, event: MouseEvent): void {
    if (!selecting || line === null) return;
    if (event.target instanceof Element && event.target.closest("button") !== null) return;
    onSelectLine(side, line, { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey });
  }
  function rowClick(row: DiffRow, event: MouseEvent): void {
    if (row.after !== null) cellClick(sideA, row.after + starts.a, event);
    else if (row.before !== null) cellClick(sideB, row.before + starts.b, event);
  }

  // Copy the before / after version. Uses the original props (not the swap-aware
  // `sides`), so "before" always means the before code regardless of the swap toggle.
  function copy(lines: LineTokens[]): void {
    void navigator.clipboard.writeText(lines.map((line) => line.text).join("\n")).then(
      () => undefined,
      () => undefined,
    );
  }

  // Match the code-block header's bare icon buttons (no padding), so the diff bar is
  // the same height.
  const btn = "inline-flex text-muted-foreground transition-colors hover:text-foreground";
  const btnOn = "text-primary inline-flex transition-colors";
  // Fixed width (not min-width) so the gutter columns are pixel-identical on every
  // row; --gutter-w is sized to the widest number the diff shows. Numbered cells are
  // buttons (click to select + share the line, like the code blocks); empty cells
  // stay plain spans.
  const gutter =
    "text-muted-foreground/40 border-border/60 w-[var(--gutter-w)] shrink-0 border-r px-2 text-right tabular-nums select-none";
  const gutterBtn =
    "text-muted-foreground/40 border-border/60 hover:bg-muted hover:text-foreground w-[var(--gutter-w)] shrink-0 cursor-pointer border-r px-2 text-right tabular-nums transition-colors select-none";
  const code =
    "doco-diff-code min-w-0 flex-1 overflow-hidden px-2.5 break-words whitespace-pre-wrap";
</script>

<div class="doco-diff-view border-border flex min-h-0 flex-1 flex-col overflow-hidden border">
  <div class="border-border bg-muted flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-xs">
    <span class="text-foreground truncate font-medium">{title}</span>
    <div class="ml-auto flex items-center gap-3">
      {#if lang.length > 0 && lang !== "text"}
        <span class="text-muted-foreground font-mono text-[0.7rem] uppercase">{lang}</span>
      {/if}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <button {...props} type="button" class={btn} aria-label="Diff options" title="Options">
              <Ellipsis class="size-4" />
            </button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-56">
          {#if !compact}
            <DropdownMenu.CheckboxItem
              checked={layout === "split"}
              onCheckedChange={(value) => (layout = value ? "split" : "unified")}
            >
              Split view
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.Separator />
          {/if}
          <DropdownMenu.CheckboxItem bind:checked={words}>
            Highlight changed words
          </DropdownMenu.CheckboxItem>
          {#if !positional}
            <DropdownMenu.CheckboxItem bind:checked={showMoves}>
              Highlight moved blocks
            </DropdownMenu.CheckboxItem>
          {/if}
          <DropdownMenu.CheckboxItem bind:checked={swapped}>
            Swap before and after
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            onclick={() => {
              copy(beforeLines);
            }}
          >
            Copy before
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onclick={() => {
              copy(afterLines);
            }}
          >
            Copy after
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <button
        type="button"
        class={selecting ? btnOn : btn}
        onclick={() => (selecting = !selecting)}
        aria-pressed={selecting}
        aria-label="Select lines to highlight"
        title="Select lines to highlight"
      >
        <TextSelect class="size-4" />
      </button>
      {#if onExpand}
        <button
          type="button"
          class={btn}
          onclick={onExpand}
          aria-label="Expand the diff"
          title="Expand"
        >
          <Maximize2 class="size-4" />
        </button>
      {/if}
      {#if onClose}
        <button type="button" class={btn} onclick={onClose} aria-label="Close" title="Close">
          <X class="size-4" />
        </button>
      {/if}
    </div>
  </div>

  <div
    class="doco-diff-body min-h-0 flex-1 overflow-auto font-mono text-[0.8125rem] leading-6"
    style="--diff-bg-light:{bgLight};--diff-bg-dark:{bgDark};--gutter-w:calc({gutterDigits}ch + 1rem)"
  >
    {#if effectiveLayout === "unified"}
      {#each rows as row, i (i)}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div
          class={`flex border-l-2 transition-colors duration-200 ${tintBorder(row)} ${tintBg(row, i)} ${selecting ? "cursor-pointer select-none" : ""}`}
          onmouseenter={() => ((hoveredMove = row.moveId), (hoveredRow = i))}
          onmouseleave={() => ((hoveredMove = null), (hoveredRow = null))}
          onclick={(event) => {
            rowClick(row, event);
          }}
        >
          {#if row.before !== null}
            {@const line = row.before + starts.b}
            <button
              type="button"
              class={gutterBtn}
              aria-label={`Select ${sideName(sideB)} line ${String(line)}`}
              onclick={(event) => {
                onSelectLine(sideB, line, {
                  shift: event.shiftKey,
                  toggle: event.ctrlKey || event.metaKey,
                });
              }}>{String(line)}</button
            >
          {:else}
            <span class={gutter}></span>
          {/if}
          {#if row.after !== null}
            {@const line = row.after + starts.a}
            <button
              type="button"
              class={gutterBtn}
              aria-label={`Select ${sideName(sideA)} line ${String(line)}`}
              onclick={(event) => {
                onSelectLine(sideA, line, {
                  shift: event.shiftKey,
                  toggle: event.ctrlKey || event.metaKey,
                });
              }}>{String(line)}</button
            >
          {:else}
            <span class={gutter}></span>
          {/if}
          <span class={`w-5 shrink-0 text-center select-none ${signColor(row)}`}>{sign(row)}</span>
          <span class={code}
            >{#each rowSegs[i] as seg, s (s)}<span
                style={seg.style}
                class={seg.changed ? highlightClass(row) : ""}>{seg.text}</span
              >{/each}</span
          >
        </div>
      {/each}
    {:else}
      {#each splitRows as sr, i (i)}
        <div class="grid grid-cols-2 gap-x-4">
          {#each [sr.left, sr.right] as c, s (s)}
            {#if c === null}
              <div class="border-l-2 border-transparent">&nbsp;</div>
            {:else}
              {@const row = rows[c.index]}
              {@const cellLine = c.line}
              <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
              <div
                class={`flex border-l-2 transition-colors duration-200 ${tintBorder(row)} ${tintBg(row, c.index)} ${selecting ? "cursor-pointer select-none" : ""}`}
                onmouseenter={() => ((hoveredMove = row.moveId), (hoveredRow = c.index))}
                onmouseleave={() => ((hoveredMove = null), (hoveredRow = null))}
                onclick={(event) => {
                  cellClick(c.side, cellLine, event);
                }}
              >
                {#if cellLine !== null}
                  <button
                    type="button"
                    class={gutterBtn}
                    aria-label={`Select ${sideName(c.side)} line ${String(cellLine)}`}
                    onclick={(event) => {
                      onSelectLine(c.side, cellLine, {
                        shift: event.shiftKey,
                        toggle: event.ctrlKey || event.metaKey,
                      });
                    }}>{c.no}</button
                  >
                {:else}
                  <span class={gutter}></span>
                {/if}
                <span class={code}
                  >{#each rowSegs[c.index] as seg, ss (ss)}<span
                      style={seg.style}
                      class={seg.changed ? highlightClass(row) : ""}>{seg.text}</span
                    >{/each}</span
                >
              </div>
            {/if}
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>
