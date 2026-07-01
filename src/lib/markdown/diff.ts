// Client-only: mount the interactive auto-diff viewer into each docomd `!!! diff`
// figure. The viewer component (and jsdiff) is lazy-imported the first time a diff
// becomes visible, never shipped to readers with no diffs. Diffs mount on first
// reveal via an IntersectionObserver, not on load: a diff inside an inactive tab or
// closed <details> has a zero-width box; revealing it gives real dimensions. Same
// pattern as charts.ts / mermaid.ts. The two source code blocks stay in the DOM as
// the before/after source (and the no-JS fallback), hidden once the viewer mounts.
import { mount, unmount, type Component } from "svelte";
import type { LineTokens } from "$lib/markdown/diff-engine";
import { DIFF_LINE_PREFIX } from "$lib/markdown/diff-select";

let observer: IntersectionObserver | null = null;
// Figures already mounting or mounted, so a second observer tick doesn't double up.
const claimed = new WeakSet<HTMLElement>();
// Live viewer apps, unmounted on teardown / client navigation.
const apps = new Map<HTMLElement, ReturnType<typeof mount>>();

// A rendered code line, reused for the diff: its plain text (for the diff algorithm)
// and its shiki tokens (text + the inline style carrying the color vars), so the diff
// shows the same syntax highlighting as the code blocks.
function readCodeTokens(block: Element): LineTokens[] {
  return [...block.querySelectorAll(".line")].map((line) => {
    const tokens = [...line.children].map((span) => ({
      text: span.textContent,
      style: span.getAttribute("style") ?? "",
    }));
    return { text: tokens.map((token) => token.text).join(""), tokens };
  });
}

// Shiki's background vars live on the .code-block wrapper's inline style; reuse them
// so the diff matches the code blocks instead of falling through to the dark card.
function readShikiBg(block: HTMLElement): { light: string; dark: string } {
  return {
    light: block.style.getPropertyValue("--shiki-light-bg").trim(),
    dark: block.style.getPropertyValue("--shiki-dark-bg").trim(),
  };
}

// The line-number start for a block (from linenums="N"), guarding missing / malformed
// / non-positive values by falling back to 1.
function readLineStart(block: HTMLElement): number {
  const raw = Number(block.dataset.lineStart);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

async function mountDiff(figure: HTMLElement): Promise<void> {
  if (claimed.has(figure)) return;
  const canvas = figure.querySelector<HTMLElement>(".doco-diff-canvas");
  const source = figure.querySelector(".doco-diff-source");
  if (canvas === null || source === null) return;
  const blocks = source.querySelectorAll<HTMLElement>(".code-block");
  // Not a before/after pair: leave the fallback source shown, don't mount.
  if (blocks.length < 2) return;

  const beforeLines = readCodeTokens(blocks[0]);
  const afterLines = readCodeTokens(blocks[1]);
  const bg = readShikiBg(blocks[0]);
  const beforeStart = readLineStart(blocks[0]);
  const afterStart = readLineStart(blocks[1]);

  // Claim before the await so a second observer tick can't double-mount while the
  // dynamic import is in flight.
  claimed.add(figure);
  const rawIndex = Number(figure.dataset.diffIndex);
  try {
    const { default: MarkdownDiff } = await import("$lib/components/markdown/MarkdownDiff.svelte");
    const app = mount(MarkdownDiff as Component, {
      target: canvas,
      props: {
        beforeLines,
        afterLines,
        title: figure.dataset.diffTitle ?? "",
        lang: figure.dataset.diffLang ?? "",
        bgLight: bg.light,
        bgDark: bg.dark,
        beforeStart,
        afterStart,
        diffIndex: Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0,
      },
    });
    apps.set(figure, app);
    // CSS collapses the now-redundant source blocks once the viewer is up.
    figure.setAttribute("data-diff-mounted", "");
  } catch (error) {
    // Unclaim so a transient failure (chunk load, render error) can retry on the
    // next reveal instead of leaving the figure dead for the page session.
    claimed.delete(figure);
    console.error("docolin: diff failed to mount", error);
  }
}

function teardownAll(): void {
  for (const app of apps.values()) void unmount(app);
  apps.clear();
}

/** Observe every diff figure so each mounts when first revealed. Call on initial
 *  load and after each client navigation. */
export function renderDiffs(): void {
  observer?.disconnect();
  teardownAll();
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) void mountDiff(entry.target as HTMLElement);
    }
  });
  const figures = [...document.querySelectorAll<HTMLElement>(".doco-diff")];
  for (const [index, figure] of figures.entries()) {
    // Document order addresses each diff's lines in the share hash.
    figure.dataset.diffIndex = String(index);
    observer.observe(figure);
  }
  // A shared link to a diff line needs its diff mounted (they lazy-mount on reveal
  // otherwise), so mount the referenced one now and bring it into view.
  const target = figures.find((_figure, index) =>
    location.hash.includes(`${DIFF_LINE_PREFIX}${String(index)}-`),
  );
  if (target !== undefined) {
    void mountDiff(target).then(() => {
      target.scrollIntoView({ block: "center" });
    });
  }
}

/** Wires diffs: mount on reveal. The viewer themes via CSS variables, so a
 *  light/dark flip needs no remount. */
export function setupDiffs(): () => void {
  renderDiffs();
  return () => {
    observer?.disconnect();
    observer = null;
    teardownAll();
  };
}
