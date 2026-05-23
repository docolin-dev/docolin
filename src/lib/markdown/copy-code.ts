// Client-only enhancement: makes the copy buttons in rendered docomd code blocks
// work. A single delegated listener handles every button on the page (the markup
// is server-rendered HTML, so there is no per-button component). Call once on
// mount; the returned function detaches it. Tiny, and the only client JS the read
// path needs besides line selection.

// Lines are block-level with the inter-line newlines dropped at render, so rejoin
// them with "\n". Line numbers, when shown, are CSS counters (not in textContent),
// so nothing needs stripping.
function copyText(pre: Element): string {
  const lines = pre.querySelectorAll(".line");
  if (lines.length === 0) return pre.textContent;
  const out: string[] = [];
  for (const line of lines) out.push(line.textContent);
  return out.join("\n");
}

export function setupCodeCopy(): () => void {
  function handler(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-code-copy]");
    if (button === null) return;
    const block = button.closest(".code-block");
    const pre = block?.querySelector("pre") ?? null;
    if (!(block instanceof HTMLElement) || pre === null) return;
    void navigator.clipboard.writeText(copyText(pre)).then(
      () => {
        block.setAttribute("data-copied", "");
        window.setTimeout(() => {
          block.removeAttribute("data-copied");
        }, 1500);
      },
      () => undefined,
    );
  }
  document.addEventListener("click", handler);
  return () => {
    document.removeEventListener("click", handler);
  };
}
