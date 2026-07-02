// Client-only: enhances inline-code color swatches (injects the color chip) and
// handles click-to-copy for any inline code tagged `doco-copy` (color swatches and
// author `{.copy}`). The chip background is set here from the validated data-color,
// so the cached HTML never ships an inline style; the "click to copy" hint is also
// set here so the cached HTML stays locale-free. One delegated listener covers
// every copyable inline code on the page (the markup is server-rendered).
import { toast } from "svelte-sonner";
import { m } from "$paraglide/messages";

function copyableText(code: HTMLElement): string {
  // Swatches copy their color value; other copyable code copies its text.
  // getAttribute (not dataset) so the type is string | null, not string.
  return code.getAttribute("data-color") ?? code.textContent;
}

// Inline code tagged copyable, plus variable chips whose value is a color
// (colors are copy-on-click by convention everywhere on docolin).
const COPYABLE = "code.doco-copy, span.doco-var.doco-copy";

/** Injects the color chip into every not-yet-enhanced swatch under `root`, and
 *  gives every copyable inline code its localized "click to copy" hover hint
 *  plus keyboard reachability (they are buttons, effectively). Idempotent, so
 *  it is safe to re-run after each client navigation. */
export function enhanceSwatches(root: ParentNode = document): void {
  const swatches = root.querySelectorAll<HTMLElement>("code.doco-swatch:not([data-swatch-ready])");
  for (const code of swatches) {
    const color = code.getAttribute("data-color");
    if (color === null) continue;
    const chip = document.createElement("span");
    chip.className = "doco-swatch-chip";
    // color came from normalizeColor at render time, so it is a safe, self-
    // contained CSS color literal, never author-controlled CSS.
    chip.style.background = color;
    chip.setAttribute("aria-hidden", "true");
    code.prepend(chip);
    code.setAttribute("data-swatch-ready", "");
  }
  for (const code of root.querySelectorAll<HTMLElement>("code.doco-copy:not([title])")) {
    code.title = m.doco_inline_copy_hint();
    makeCopyFocusable(code);
  }
}

/** Marks a copyable element as a keyboard-reachable button (Enter/Space copy,
 *  handled by the shared listeners). Chips call this when they turn colored. */
export function makeCopyFocusable(el: HTMLElement): void {
  el.tabIndex = 0;
  el.setAttribute("role", "button");
}

function copyFrom(code: HTMLElement): void {
  const text = copyableText(code);
  void navigator.clipboard.writeText(text).then(
    () => {
      code.setAttribute("data-copied", "");
      window.setTimeout(() => {
        code.removeAttribute("data-copied");
      }, 1200);
      // The copied value as the description, so the reader sees what actually
      // landed in the clipboard (a swatch's color value, the text otherwise).
      toast.success(m.doco_inline_copied_toast(), { description: text });
    },
    () => {
      // Clipboard can fail (permission denied, insecure context); saying so
      // beats letting the reader paste stale contents somewhere.
      toast.error(m.doco_inline_copy_failed_toast());
    },
  );
}

/** Wires copy for inline code (swatches + `{.copy}`) via click and keyboard,
 *  and does the initial swatch enhancement. Returns a teardown. */
export function setupInlineCopy(): () => void {
  enhanceSwatches();
  function onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const code = event.target.closest<HTMLElement>(COPYABLE);
    if (code !== null) copyFrom(code);
  }
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    // A held key auto-repeats; one activation per press is the button contract.
    if (event.repeat) return;
    if (!(event.target instanceof Element)) return;
    const code = event.target.closest<HTMLElement>(COPYABLE);
    if (code === null) return;
    event.preventDefault();
    copyFrom(code);
  }
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  return () => {
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
  };
}
