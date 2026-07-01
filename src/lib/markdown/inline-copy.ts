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

/** Injects the color chip into every not-yet-enhanced swatch under `root`, and
 *  gives every copyable inline code its localized "click to copy" hover hint.
 *  Idempotent, so it is safe to re-run after each client navigation. */
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
  }
}

/** Wires click-to-copy for inline code (swatches + `{.copy}`) and does the initial
 *  swatch enhancement. Returns a teardown. */
export function setupInlineCopy(): () => void {
  enhanceSwatches();
  function handler(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const code = event.target.closest<HTMLElement>("code.doco-copy");
    if (code === null) return;
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
      () => undefined,
    );
  }
  document.addEventListener("click", handler);
  return () => {
    document.removeEventListener("click", handler);
  };
}
