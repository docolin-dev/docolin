// Maps a parsed markdown table into the shape LayerChart wants. Pure and
// DOM-free so it is unit-testable; the client (charts.ts) reads the <table> from
// the DOM and calls this. Convention: the first column is the x-axis category, and
// every remaining column is a series whose header cell is its label.

export interface ChartSeries {
  /** Stable data key (`s0`, `s1`, ...), independent of the header text. */
  key: string;
  /** Human label from the header cell. */
  label: string;
  /** A token from the shared --chart-1..5 palette (cycles past five series). */
  color: string;
}

export interface ChartModel {
  /** One object per row: `{ x: "Jan", s0: 186, s1: 80 }`. */
  data: Record<string, string | number>[];
  series: ChartSeries[];
}

// "1,234" -> 1234, " 12 " -> 12, "n/a" -> 0. String ops only (no regex). A
// non-numeric cell becomes 0 so one stray cell can't break the whole chart.
function parseNumber(raw: string): number {
  const cleaned = raw.split(",").join("").trim();
  if (cleaned.length === 0) return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/** Builds the chart model from a table's header labels and body rows. */
export function buildChartModel(headers: string[], rows: string[][]): ChartModel {
  const seriesLabels = headers.slice(1);
  const series: ChartSeries[] = seriesLabels.map((label, index) => ({
    key: `s${String(index)}`,
    label,
    color: `var(--chart-${String((index % 5) + 1)})`,
  }));
  const data = rows.map((cells) => {
    const row: Record<string, string | number> = { x: cells[0] ?? "" };
    for (const [index, member] of series.entries()) {
      row[member.key] = parseNumber(cells[index + 1] ?? "");
    }
    return row;
  });
  return { data, series };
}

/** Renders header + body cells back to a GitHub-flavored Markdown table, columns
 *  padded to the widest cell so the copied text stays readable. Drives the chart's
 *  "copy table as Markdown" button. */
export function tableToMarkdown(headers: string[], rows: string[][]): string {
  // Column widths: the widest cell in each column, at least 3 (a valid `---` cell).
  const widths = headers.map((header, col) => {
    let max = header.length;
    for (const row of rows) {
      const cell = row.at(col) ?? "";
      if (cell.length > max) max = cell.length;
    }
    return max < 3 ? 3 : max;
  });
  const formatRow = (cells: string[]): string => {
    const padded = widths.map((width, col) => {
      const cell = cells.at(col) ?? "";
      return cell + " ".repeat(Math.max(0, width - cell.length));
    });
    return `| ${padded.join(" | ")} |`;
  };
  const divider = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  return [formatRow(headers), divider, ...rows.map(formatRow)].join("\n");
}
