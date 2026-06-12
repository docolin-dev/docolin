---
title: Charts
description: Add one line under a Markdown table and it renders as a bar, line, area, pie, or donut chart, with the table kept underneath as the data.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/charts
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: intermediate
  time_estimate: 8m

  status: draft

  aliases: [charts, graphs, bar chart, line chart, pie chart, data visualization]

  prev: ./diagrams.md
  next: ./math.md
---

# Charts

Pango keeps a logbook, and numbers in a [table](./tables.md) are precise but hard to feel. A chart makes the shape obvious at a glance. In docolin you do not learn a charting syntax: you write a normal table and add one line.

## How it works

Put a `{ .chart ... }` line right after a table. docolin draws the chart on top and visually hides the table, but the table stays in the page. That table is the source of truth: the no-JS fallback, the SEO content, the screen-reader view, and what an AI reads. You get the picture without giving up the data.

The first column is the x-axis; every other column is a series named by its header.

## Bar

```md
| Month | Ants | Termites |
| ----- | ---- | -------- |
| Jan   | 186  | 80       |
| Feb   | 305  | 200      |
| Mar   | 237  | 120      |

{ .chart type=bar title="Snacks eaten per month" }
```

| Month | Ants | Termites |
| ----- | ---- | -------- |
| Jan   | 186  | 80       |
| Feb   | 305  | 200      |
| Mar   | 237  | 120      |

{ .chart type=bar title="Snacks eaten per month" }

## The types

Set `type=` to one of five. The same table works across all of them, so try a couple and keep the one that reads best.

- **`bar`** compares values across categories.
- **`line`** shows a trend over an ordered axis like time.
- **`area`** is a line with the space below it filled, good for volume.
- **`pie`** shows parts of a whole, one value column, one slice per row.
- **`donut`** is a pie with a hole in the middle.

```md
| Day | Curls | Rolls |
| --- | ----- | ----- |
| Mon | 12    | 4     |
| Tue | 19    | 7     |
| Wed | 15    | 11    |
| Thu | 22    | 9     |

{ .chart type=line title="Reps over the week" }
```

| Day | Curls | Rolls |
| --- | ----- | ----- |
| Mon | 12    | 4     |
| Tue | 19    | 7     |
| Wed | 15    | 11    |
| Thu | 22    | 9     |

{ .chart type=line title="Reps over the week" }

For a part-of-whole, use one value column:

```md
| Snack    | Share |
| -------- | ----- |
| Ants     | 70    |
| Termites | 20    |
| Grubs    | 10    |

{ .chart type=donut title="Diet" }
```

| Snack    | Share |
| -------- | ----- |
| Ants     | 70    |
| Termites | 20    |
| Grubs    | 10    |

{ .chart type=donut title="Diet" }

## Options

Stack them after `type` on the same line:

- **`title="..."`** captions the chart.
- **`stacked`** stacks the series instead of grouping them (`bar` and `area`).
- **`horizontal`** lays bars on their side, handy for long category names (`bar`).
- **`legend=false`** hides the legend, useful with a single series.

```md
{ .chart type=bar stacked title="Foraging by time of day" }
{ .chart type=bar horizontal legend=false title="Favourite apparatus" }
```

## Hidden until revealed

A chart inside a [tab](./tabs.md) or [callout](./callouts.md) starts with no width to measure, so it is drawn the moment you reveal it rather than at load. There is nothing extra to do; it just works.

## Gotchas

- **The table is the data.** Keep it correct and readable on its own; everything the chart shows comes from it, and it is what survives without JavaScript.
- **First column is the axis.** Put your categories or time steps in column one and your numbers in the rest.
- **Pie and donut want one value column.** Extra numeric columns are ignored for those types; use `bar` or `line` to compare multiple series.
- **Numbers, not prose, in value cells.** A cell like `1,284` is fine, but `about 1k` is not a number and won't plot.

## See also

- [Tables](./tables.md), the foundation every chart is built on.
- [Diagrams](./diagrams.md), for relationships and flows rather than quantities.
