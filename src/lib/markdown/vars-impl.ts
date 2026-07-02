import { mount, unmount, type Component } from "svelte";
import { m } from "$paraglide/messages";
import { VarsStore } from "./vars-store.svelte.ts";
import { evaluateExpression, expressionIdentifiers, type ExprValue } from "./expr.ts";
import type { VarDeclaration } from "./inputs.ts";
import { normalizeColor } from "./color.ts";
import { makeCopyFocusable } from "./inline-copy.ts";
import { refreshChart } from "./charts.ts";
import InputsCard from "$lib/components/markdown/InputsCard.svelte";

// The loaded half of interactive variables (see vars.ts for the light entry).
// Owns one page at a time: builds the shared reactive store from every card's
// declarations (document order), mounts the Svelte form into each card, and
// keeps every `{{ }}` chip in the page live. Chips are server-rendered spans,
// updated by textContent writes (values are text, never HTML, so there is no
// injection surface); charts whose source table contains a chip re-mount,
// debounced, so tables and charts recompute as the reader types.

interface Chip {
  el: HTMLElement;
  expr: string;
  /** The raw `{{ ... }}` fallback text, restored while unfilled. */
  raw: string;
  identifiers: string[];
  /** The chart figure this chip feeds, if any. */
  chart: HTMLElement | null;
}

interface PageState {
  store: VarsStore;
  chips: Chip[];
  apps: ReturnType<typeof mount>[];
  unsubscribe: () => void;
  chartTimer: number | null;
}

let page: PageState | null = null;

interface CardPayload {
  declarations: VarDeclaration[];
  problems: string[];
}

function readCard(card: HTMLElement): CardPayload | null {
  const raw = card.getAttribute("data-inputs-card");
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A malformed payload (should not happen; we serialize it) must not break
    // the page; the static fallback stays visible instead.
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const payload = parsed as { declarations?: VarDeclaration[]; problems?: string[] };
  if (!Array.isArray(payload.declarations)) return null;
  return { declarations: payload.declarations, problems: payload.problems ?? [] };
}

function collectChips(): Chip[] {
  const chips: Chip[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("span.doco-var[data-expr]")) {
    const expr = el.getAttribute("data-expr");
    if (expr === null) continue;
    chips.push({
      el,
      expr,
      raw: el.textContent,
      identifiers: expressionIdentifiers(expr) ?? [],
      chart: el.closest<HTMLElement>(".doco-chart"),
    });
  }
  return chips;
}

function displayValue(value: ExprValue): string {
  // NaN reads as "not filled in usefully", not as a value worth rendering.
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  return String(value);
}

// Strips the color-copy affordance from a chip whose value is not a color
// (anymore). The swatch child itself is wiped by the textContent write.
function dropColor(el: HTMLElement): void {
  el.classList.remove("doco-copy");
  el.removeAttribute("data-color");
  el.removeAttribute("role");
  el.removeAttribute("tabindex");
}

function updateChips(state: PageState): void {
  const { values, tainted } = state.store.resolved;
  const staleCharts = new Set<HTMLElement>();
  for (const chip of state.chips) {
    const before = chip.el.textContent;
    if (chip.identifiers.some((name) => tainted.has(name))) {
      chip.el.setAttribute("data-var-state", "unfilled");
      chip.el.setAttribute("title", m.doco_var_unfilled_hint());
      dropColor(chip.el);
      chip.el.textContent = chip.raw;
    } else {
      // The evaluator throws by design on anything outside the grammar (or on a
      // reference to an errored computed variable); that renders as an error
      // chip, never as a crash.
      try {
        const value = evaluateExpression(chip.expr, values, state.store.todayIso);
        chip.el.setAttribute("data-var-state", "filled");
        chip.el.removeAttribute("title");
        chip.el.textContent = displayValue(value);
        // A color value behaves exactly like a static inline color swatch: the
        // same chip, and the same click-to-copy contract (doco-copy class +
        // data-color feed the shared inline-copy handler). Everything else is
        // display only. normalizeColor is the strict validator, so the
        // background can only ever be a self-contained color literal.
        const color = typeof value === "string" ? normalizeColor(value) : null;
        if (color !== null) {
          chip.el.classList.add("doco-copy");
          chip.el.setAttribute("data-color", color);
          chip.el.setAttribute("title", m.doco_inline_copy_hint());
          makeCopyFocusable(chip.el);
          const swatch = document.createElement("span");
          swatch.className = "doco-swatch-chip";
          swatch.style.background = color;
          swatch.setAttribute("aria-hidden", "true");
          chip.el.prepend(swatch);
        } else {
          dropColor(chip.el);
        }
      } catch (error) {
        chip.el.setAttribute("data-var-state", "error");
        // Localized lead-in for readers; the raw evaluator message stays as the
        // diagnostic detail (it is author-facing English, like a compiler error).
        const detail = error instanceof Error ? error.message : String(error);
        chip.el.setAttribute("title", `${m.doco_var_error_hint()}: ${detail}`);
        dropColor(chip.el);
        chip.el.textContent = chip.raw;
      }
    }
    if (chip.chart !== null && chip.el.textContent !== before) staleCharts.add(chip.chart);
  }
  if (staleCharts.size > 0) scheduleChartRefresh(state, staleCharts);
}

// Charts re-mount from their table, which is heavier than a text write, so
// refreshes trail the keystrokes.
const CHART_REFRESH_MS = 250;
const pendingCharts = new Set<HTMLElement>();

function scheduleChartRefresh(state: PageState, charts: ReadonlySet<HTMLElement>): void {
  for (const chart of charts) pendingCharts.add(chart);
  if (state.chartTimer !== null) window.clearTimeout(state.chartTimer);
  state.chartTimer = window.setTimeout(() => {
    state.chartTimer = null;
    for (const chart of pendingCharts) refreshChart(chart);
    pendingCharts.clear();
  }, CHART_REFRESH_MS);
}

/** Mounts the page: one shared store across all cards, a Svelte form per card,
 *  and the live chip subscription. */
export function mountPage(): void {
  teardownPage();
  const cardEls = [...document.querySelectorAll<HTMLElement>("[data-doco-inputs]")];
  const cards = cardEls
    .map((el) => ({ el, payload: readCard(el) }))
    .filter((card): card is { el: HTMLElement; payload: CardPayload } => card.payload !== null);
  if (cards.length === 0) return;

  // Names are doc-scoped: merge every card's declarations in document order
  // (redeclarations were already dropped per card; across cards the first wins).
  const seen = new Set<string>();
  const declarations: VarDeclaration[] = [];
  for (const card of cards) {
    for (const decl of card.payload.declarations) {
      if (seen.has(decl.name)) continue;
      seen.add(decl.name);
      declarations.push(decl);
    }
  }

  const store = new VarsStore(declarations, location.pathname);
  const state: PageState = {
    store,
    chips: collectChips(),
    apps: [],
    unsubscribe: () => undefined,
    chartTimer: null,
  };

  for (const card of cards) {
    const canvas = card.el.querySelector<HTMLElement>(".doco-inputs-canvas");
    if (canvas === null) continue;
    state.apps.push(
      mount(InputsCard as Component, {
        target: canvas,
        props: { store, declarations: card.payload.declarations, problems: card.payload.problems },
      }),
    );
    // CSS hides the static fallback once the real form is up.
    card.el.setAttribute("data-inputs-mounted", "");
  }

  state.unsubscribe = store.onChange(() => {
    updateChips(state);
  });
  page = state;
  updateChips(state);
}

/** Unmounts the current page's cards and listeners (navigation / teardown). */
export function teardownPage(): void {
  if (page === null) return;
  page.unsubscribe();
  if (page.chartTimer !== null) window.clearTimeout(page.chartTimer);
  pendingCharts.clear();
  for (const app of page.apps) void unmount(app);
  page = null;
}
