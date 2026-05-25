// Fires a callback once a page has been *actively read* for a threshold of time:
// it accumulates only the time the tab is actually visible, pausing while the
// reader is on another tab or has the window hidden. Used to decide when a doco
// view counts toward the local setup profile (a real read, not a bounce/skim).

export interface DwellOptions {
  /** Active-visible time required before firing. Defaults to 20s. */
  thresholdMs?: number;
  /** Called once, the moment accumulated active time crosses the threshold. */
  onThreshold: () => void;
}

const DEFAULT_THRESHOLD_MS = 20_000;
const TICK_MS = 1_000;

/**
 * Begins tracking active-visible dwell time. Returns a cleanup function; call it
 * on unmount or before starting a new track (e.g. when the reader navigates to a
 * different doco). No-op outside the browser.
 */
export function trackDwell(options: DwellOptions): () => void {
  if (typeof document === "undefined") return () => undefined;

  const threshold = options.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  let accumulatedMs = 0;
  let segmentStart: number | null = null;
  let fired = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const isVisible = (): boolean => document.visibilityState === "visible";

  const resume = (): void => {
    if (segmentStart === null && isVisible()) segmentStart = Date.now();
  };

  const pause = (): void => {
    if (segmentStart !== null) {
      accumulatedMs += Date.now() - segmentStart;
      segmentStart = null;
    }
  };

  const cleanup = (): void => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const check = (): void => {
    if (fired) return;
    const running = segmentStart !== null ? Date.now() - segmentStart : 0;
    if (accumulatedMs + running >= threshold) {
      fired = true;
      cleanup();
      options.onThreshold();
    }
  };

  function onVisibilityChange(): void {
    if (isVisible()) resume();
    else pause();
  }

  resume();
  timer = setInterval(check, TICK_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return cleanup;
}
