<script lang="ts">
  // Client-mounted chart for a docomd `{ .chart }` table. Lazy-imported by
  // src/lib/markdown/charts.ts, so LayerChart + d3 only load on pages with a
  // chart. We don't wrap LayerChart; we compose it with the shadcn Chart helpers,
  // matching the upstream pattern so future LayerChart upgrades stay drop-in.
  import { AreaChart, BarChart, LineChart, PieChart } from "layerchart";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { slugify } from "$lib/slug";
  import type { ChartSeries } from "$lib/markdown/render/chart-data";

  interface Props {
    type: string;
    stacked: boolean;
    legend: boolean;
    horizontal: boolean;
    data: Record<string, string | number>[];
    series: ChartSeries[];
  }
  let { type, stacked, legend, horizontal, data, series }: Props = $props();

  const isPie = $derived(type === "pie" || type === "donut");

  // LayerChart series over the shared wide dataset: each reads its own column by
  // key (the `value` accessor), so every mark plots a single value. The band tooltip
  // then snaps to the nearest x and shows all series there.
  const chartSeries = $derived(
    series.map((member) => ({
      key: member.key,
      label: member.label,
      color: member.color,
      value: member.key,
    })),
  );
  // The value-axis accessor: every series' data key. Passed explicitly because
  // BarChart forwards a bare y/x to <Chart>, whose inferred accessor is null when
  // unset. An array accessor reads all series values per row (for the scale domain).
  const valueKeys = $derived(series.map((member) => member.key));

  // Chart config: Chart.Container emits a --color-<key> CSS var per entry, which
  // the series colors reference, so the chart re-themes with `.dark` for free.
  const config = $derived(
    Object.fromEntries(
      series.map((member) => [member.key, { label: member.label, color: member.color }]),
    ) as Chart.ChartConfig,
  );

  // Pie/donut: one slice per row, valued by the first series column, colored from
  // the shared palette.
  const pieData = $derived(
    data.map((row, index) => ({
      name: String(row.x),
      value: Number(row[series[0]?.key ?? "s0"]) || 0,
      color: `var(--chart-${String((index % 5) + 1)})`,
    })),
  );
  const pieConfig = $derived(
    Object.fromEntries(
      pieData.map((slice, index) => [
        slugify(slice.name) || `c${String(index)}`,
        { label: slice.name, color: slice.color },
      ]),
    ) as Chart.ChartConfig,
  );

  // Size LayerChart from our own measured box, but hold the last non-zero value. An
  // inactive content tab sets display:none, dropping the measured size to 0; LayerChart
  // would then compute a negative inner box (0 - padding) and the browser rejects the
  // <rect>. Holding the last positive size keeps it valid (and harmless, since it's
  // hidden), while a genuine resize still flows through. Rendering waits for the first
  // measure so there's no zero-size first frame either.
  let boxWidth = $state(0);
  let boxHeight = $state(0);
  let width = $state(0);
  let height = $state(0);
  $effect(() => {
    if (boxWidth > 0) width = boxWidth;
    if (boxHeight > 0) height = boxHeight;
  });

  // Horizontal bars put the category labels on the left axis. LayerChart reserves a
  // fixed 20px there regardless of label length, so long labels spill out of the
  // figure. Reserve room sized to the longest label (~7px/char), floored at the
  // default and capped at half the chart so it can't crowd out the bars.
  const longestLabel = $derived(data.reduce((max, row) => Math.max(max, String(row.x).length), 0));
  const horizontalPadding = $derived({
    top: 4,
    right: 8,
    bottom: 20 + (legend ? 32 : 0),
    left: Math.max(20, Math.min(longestLabel * 7 + 14, width * 0.5)),
  });
</script>

<div class="aspect-video w-full" bind:clientWidth={boxWidth} bind:clientHeight={boxHeight}>
  {#if width > 0 && height > 0}
    {#if isPie}
      <Chart.Container config={pieConfig} class="h-full w-full">
        <PieChart
          {width}
          {height}
          data={pieData}
          key="name"
          value="value"
          label="name"
          cRange={pieData.map((slice) => slice.color)}
          innerRadius={type === "donut" ? 0.6 : 0}
          {legend}
        >
          {#snippet tooltip()}
            <Chart.Tooltip nameKey="name" />
          {/snippet}
        </PieChart>
      </Chart.Container>
    {:else if type === "line"}
      <Chart.Container {config} class="h-full w-full">
        <LineChart
          {width}
          {height}
          {data}
          x="x"
          y={valueKeys}
          axis="x"
          series={chartSeries}
          {legend}
          tooltipContext={{ mode: "band" }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip />
          {/snippet}
        </LineChart>
      </Chart.Container>
    {:else if type === "area"}
      <Chart.Container {config} class="h-full w-full">
        <AreaChart
          {width}
          {height}
          {data}
          x="x"
          y={valueKeys}
          axis="x"
          seriesLayout={stacked ? "stack" : "overlap"}
          series={chartSeries}
          {legend}
          tooltipContext={{ mode: "band" }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip />
          {/snippet}
        </AreaChart>
      </Chart.Container>
    {:else if horizontal}
      <Chart.Container {config} class="h-full w-full">
        <BarChart
          {width}
          {height}
          {data}
          y="x"
          x={valueKeys}
          axis="y"
          orientation="horizontal"
          padding={horizontalPadding}
          seriesLayout={stacked ? "stack" : "group"}
          series={chartSeries}
          {legend}
        >
          {#snippet tooltip()}
            <Chart.Tooltip />
          {/snippet}
        </BarChart>
      </Chart.Container>
    {:else}
      <Chart.Container {config} class="h-full w-full">
        <BarChart
          {width}
          {height}
          {data}
          x="x"
          y={valueKeys}
          axis="x"
          seriesLayout={stacked ? "stack" : "group"}
          series={chartSeries}
          {legend}
        >
          {#snippet tooltip()}
            <Chart.Tooltip />
          {/snippet}
        </BarChart>
      </Chart.Container>
    {/if}
  {/if}
</div>
