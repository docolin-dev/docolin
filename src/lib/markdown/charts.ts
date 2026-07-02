// Client-only: mount a LayerChart into each docomd `{ .chart }` figure. The chart
// component (and LayerChart + d3) is lazy-imported the first time a chart becomes
// visible, never shipped to readers with no charts. Charts mount on first reveal
// via an IntersectionObserver, not on load: a chart inside an inactive tab or a
// closed <details> has a zero-width box and would lay out wrong; revealing it
// (tab switch, accordion open, scroll) gives it real dimensions. Same pattern as
// mermaid.ts. The source <table> stays in the DOM (sr-only) as the data source.
import { mount, unmount, type Component } from "svelte";
import { buildChartModel, tableToMarkdown } from "./render/chart-data.ts";

let observer: IntersectionObserver | null = null;
// Figures already mounting or mounted, so a second observer tick doesn't double up.
const claimed = new WeakSet<HTMLElement>();
// Live chart apps, so they can be unmounted on teardown / client navigation
// (Svelte components on detached nodes would otherwise leak).
const apps = new Map<HTMLElement, ReturnType<typeof mount>>();

function readTable(table: HTMLTableElement): { headers: string[]; rows: string[][] } {
  const headers = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent.trim());
  const rows = [...table.querySelectorAll("tbody tr")].map((row) =>
    [...row.children].map((cell) => cell.textContent.trim()),
  );
  return { headers, rows };
}

async function mountChart(figure: HTMLElement): Promise<void> {
  if (claimed.has(figure)) return;
  const canvas = figure.querySelector<HTMLElement>(".doco-chart-canvas");
  const table = figure.querySelector("table");
  if (canvas === null || table === null) return;

  const { headers, rows } = readTable(table);
  // Needs at least an x column plus one series, and at least one data row.
  if (headers.length < 2 || rows.length === 0) return;
  const model = buildChartModel(headers, rows);

  // Claim before the await so a second IntersectionObserver tick can't double-mount
  // the same figure while the dynamic import is in flight.
  claimed.add(figure);
  try {
    const { default: MarkdownChart } =
      await import("$lib/components/markdown/MarkdownChart.svelte");
    const app = mount(MarkdownChart as Component, {
      target: canvas,
      props: {
        type: figure.dataset.docoChart ?? "bar",
        stacked: figure.hasAttribute("data-stacked"),
        legend: figure.hasAttribute("data-legend"),
        horizontal: figure.hasAttribute("data-horizontal"),
        data: model.data,
        series: model.series,
      },
    });
    apps.set(figure, app);
  } catch (error) {
    // A chart that throws while mounting (bad data, a LayerChart API change) must
    // not vanish silently behind a blank box; surface it for whoever's debugging.
    console.error("docolin: chart failed to mount", error, { headers, rows });
  }
}

function teardownAll(): void {
  for (const app of apps.values()) void unmount(app);
  apps.clear();
}

/** Re-mounts one chart figure, re-reading its source table. Interactive
 *  variables call this (debounced) when a `{{ }}` chip inside the table
 *  changed, so charts recompute live with the reader's values. */
export function refreshChart(figure: HTMLElement): void {
  const app = apps.get(figure);
  if (app !== undefined) {
    void unmount(app);
    apps.delete(figure);
  }
  claimed.delete(figure);
  void mountChart(figure);
}

// Copy the chart's source table as a Markdown table (rebuilt from the kept <table>,
// re-aligned), with the same `data-copied` feedback the code-block copy button uses.
function onCopyClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-chart-copy]");
  if (button === null) return;
  const figure = button.closest(".doco-chart");
  const table = figure?.querySelector("table") ?? null;
  if (!(figure instanceof HTMLElement) || table === null) return;
  const { headers, rows } = readTable(table);
  if (headers.length === 0) return;
  void navigator.clipboard.writeText(tableToMarkdown(headers, rows)).then(
    () => {
      figure.setAttribute("data-copied", "");
      window.setTimeout(() => {
        figure.removeAttribute("data-copied");
      }, 1500);
    },
    () => undefined,
  );
}

/** Mount any chart figures within a subtree immediately (no IntersectionObserver),
 *  for cloned markup like a footnote/annotation popover that is already visible. */
export function mountChartsIn(root: ParentNode): void {
  for (const figure of root.querySelectorAll<HTMLElement>(".doco-chart")) void mountChart(figure);
}

/** Observe every chart figure so each mounts when first revealed. Call on initial
 *  load and after each client navigation (new pages bring new charts; old ones are
 *  gone, so we rebuild the observer and tear down stale mounts). */
export function renderCharts(): void {
  observer?.disconnect();
  teardownAll();
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) void mountChart(entry.target as HTMLElement);
    }
  });
  for (const figure of document.querySelectorAll<HTMLElement>(".doco-chart"))
    observer.observe(figure);
}

/** Wires charts: mount on reveal. Themeing is handled by CSS variables in the
 *  chart config, so a light/dark flip needs no remount. */
export function setupCharts(): () => void {
  renderCharts();
  document.addEventListener("click", onCopyClick);
  return () => {
    observer?.disconnect();
    observer = null;
    teardownAll();
    document.removeEventListener("click", onCopyClick);
  };
}
