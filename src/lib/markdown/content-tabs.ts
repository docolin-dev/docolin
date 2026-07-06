// Client-only enhancement for content tabs. Switching is pure CSS (a hidden radio
// group), so this script does NOT touch panel visibility, no flash, and tabs keep
// working after a client-side navigation without it. It only adds two niceties:
// cross-set sync (picking "pnpm" in one block selects it everywhere that has it)
// and remembering the choice in localStorage. setupContentTabs wires the listener
// once; applyTabPreference reapplies the stored choice (call it after navigations).

const STORAGE_KEY = "docomd-tabs";
const MAX_PREFERRED = 20;

// Preferred labels, most-recent first, so a reader's tab choice sticks.
function readPreferred(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: unknown[] = parsed;
    return items.filter((value): value is string => typeof value === "string");
  } catch {
    // localStorage throws when disabled or in private mode; persistence is
    // best-effort, so treat that as "no preference".
    return [];
  }
}

function writePreferred(labels: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(labels.slice(0, MAX_PREFERRED)));
  } catch {
    // See readPreferred: storage failures are non-fatal.
  }
}

// Check the radio for `label` in every set that has it. Setting `.checked`
// programmatically does not fire `change`, so this never recurses.
function syncTo(label: string): void {
  for (const radio of document.querySelectorAll<HTMLInputElement>(".tabbed-radio")) {
    if (radio.dataset.tabLabel === label) radio.checked = true;
  }
}

function onChange(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (!event.target.classList.contains("tabbed-radio")) return;
  const label = event.target.dataset.tabLabel;
  if (label === undefined) return;
  // Cross-set sync can resize tab sets ABOVE the one the reader clicked; the
  // document then shifts and the clicked tab jumps away from the cursor.
  // Anchor the clicked set's viewport position across the sync and scroll by
  // whatever it moved (the set's own panel switch never moves its top).
  const set = event.target.closest(".tabbed-set");
  const topBefore = set?.getBoundingClientRect().top;
  syncTo(label);
  if (set !== null && topBefore !== undefined) {
    const delta = set.getBoundingClientRect().top - topBefore;
    if (delta !== 0) window.scrollBy(0, delta);
  }
  writePreferred([label, ...readPreferred().filter((other) => other !== label)]);
}

/** Reapply the stored tab choice to every set that supports it (call on initial
 *  load and after each client navigation). Sets the first matching radio, which
 *  the CSS then reflects. */
export function applyTabPreference(): void {
  const preferred = readPreferred();
  if (preferred.length === 0) return;
  for (const set of document.querySelectorAll(".tabbed-set")) {
    const radios = [...set.querySelectorAll<HTMLInputElement>(".tabbed-radio")];
    for (const label of preferred) {
      const radio = radios.find((candidate) => candidate.dataset.tabLabel === label);
      if (radio !== undefined) {
        radio.checked = true;
        break;
      }
    }
  }
}

/** Wires cross-set tab sync + persistence. Returns a teardown function. */
export function setupContentTabs(): () => void {
  document.addEventListener("change", onChange);
  return () => {
    document.removeEventListener("change", onChange);
  };
}
