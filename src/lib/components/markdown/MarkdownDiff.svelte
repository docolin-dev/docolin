<script lang="ts">
  // Thin wrapper mounted by src/lib/markdown/diff.ts. Renders the DiffTable viewer
  // inline in compact mode (unified, with an expand button) and, when expanded,
  // again inside a near-fullscreen dialog (split + full controls). Also owns the
  // shareable line selection, shared by both copies and mirrored into the URL hash
  // so a link reopens with the same lines lit (see diff-select.ts).
  import * as Dialog from "$lib/components/ui/dialog";
  import DiffTable from "./DiffTable.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { LineTokens } from "$lib/markdown/diff-engine";
  import {
    parseDiffHash,
    buildDiffTokens,
    diffLineKey,
    DIFF_LINE_PREFIX,
    type DiffSide,
  } from "$lib/markdown/diff-select";
  import { replaceHashTokens } from "$lib/markdown/hash-tokens";

  interface Props {
    beforeLines: LineTokens[];
    afterLines: LineTokens[];
    title?: string;
    lang: string;
    bgLight: string;
    bgDark: string;
    beforeStart: number;
    afterStart: number;
    /** This diff's document order on the page; addresses its lines in the hash. */
    diffIndex: number;
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
    diffIndex,
  }: Props = $props();

  let open = $state(false);

  // Only ever mounted client-side (by diff.ts). Populated from the URL hash by the
  // effect below (initial read + hashchange), so a shared link reopens lit.
  const selected = new SvelteSet<string>();
  // The line a shift+click range extends from (the last single line picked).
  let anchor: { side: DiffSide; line: number } | null = null;

  function writeHash(): void {
    const tokens = buildDiffTokens(selected, diffIndex);
    const hash = replaceHashTokens(
      location.hash,
      `${DIFF_LINE_PREFIX}${String(diffIndex)}-`,
      tokens,
    );
    const url = hash === "" ? location.pathname + location.search : `#${hash}`;
    // Preserve whatever state SvelteKit's router stored; replaceState so fiddling
    // with lines neither spams Back nor jumps the page.
    const state: unknown = history.state;
    history.replaceState(state, "", url);
  }

  // Same selection model as code-block lines: plain click replaces the selection,
  // shift extends a same-side range from the anchor, ctrl/cmd toggles one line.
  function selectLine(
    side: DiffSide,
    line: number,
    opts: { shift: boolean; toggle: boolean },
  ): void {
    const key = diffLineKey(side, line);
    if (opts.shift && anchor !== null && anchor.side === side) {
      const lo = Math.min(anchor.line, line);
      const hi = Math.max(anchor.line, line);
      for (let at = lo; at <= hi; at++) selected.add(diffLineKey(side, at));
    } else if (opts.toggle) {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      anchor = { side, line };
    } else {
      selected.clear();
      selected.add(key);
      anchor = { side, line };
    }
    writeHash();
  }

  $effect(() => {
    const applyHash = (): void => {
      const next = parseDiffHash(location.hash, diffIndex);
      selected.clear();
      for (const key of next) selected.add(key);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
    };
  });
</script>

<DiffTable
  {beforeLines}
  {afterLines}
  {title}
  {lang}
  {bgLight}
  {bgDark}
  {beforeStart}
  {afterStart}
  {selected}
  onSelectLine={selectLine}
  compact
  onExpand={() => (open = true)}
/>

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class="flex h-[90vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
  >
    <Dialog.Title class="sr-only">{title.length > 0 ? title : "Diff"}</Dialog.Title>
    <DiffTable
      {beforeLines}
      {afterLines}
      {title}
      {lang}
      {bgLight}
      {bgDark}
      {beforeStart}
      {afterStart}
      {selected}
      onSelectLine={selectLine}
      onClose={() => (open = false)}
    />
  </Dialog.Content>
</Dialog.Root>
