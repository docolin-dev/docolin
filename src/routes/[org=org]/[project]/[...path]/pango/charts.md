---
title: Charts
description: A normal markdown table plus a trailing { .chart } line becomes a chart. The table stays in the page as the data; the chart is painted on top.
---

Pango keeps a logbook. Write a normal table, then add a `{ .chart ... }` line right
after it, and the table renders as a chart. The real table stays in the page (it's
the no-JS fallback, the SEO content, the screen-reader view, and what an AI reads),
just visually hidden once the chart paints on top.

The first column is the x-axis; every other column is a series named by its header.

## Bar

| Month | Ants | Termites |
| ----- | ---- | -------- |
| Jan   | 186  | 80       |
| Feb   | 305  | 200      |
| Mar   | 237  | 120      |
| Apr   | 173  | 190      |

{ .chart type=bar title="Snacks eaten per month" }

## Stacked bar

Add `stacked` to stack the series instead of grouping them.

| Quarter | Morning | Afternoon | Night |
| ------- | ------- | --------- | ----- |
| Q1      | 40      | 95        | 160   |
| Q2      | 55      | 120       | 180   |
| Q3      | 70      | 110       | 150   |
| Q4      | 60      | 130       | 170   |

{ .chart type=bar stacked title="Foraging by time of day" }

## Horizontal bar

Add `horizontal` to lay the bars on their side, handy for long category names.

| Apparatus    | Climbs |
| ------------ | ------ |
| High bars    | 42     |
| Rope         | 31     |
| Rings        | 18     |
| Balance beam | 9      |

{ .chart type=bar horizontal legend=false title="Favorite apparatus" }

## Line

| Day | Curls | Rolls |
| --- | ----- | ----- |
| Mon | 12    | 4     |
| Tue | 19    | 7     |
| Wed | 15    | 11    |
| Thu | 22    | 9     |
| Fri | 30    | 14    |

{ .chart type=line title="Reps over the week" }

## Area

Areas stack with `stacked` too.

| Week | Naps | Snacks | Climbs |
| ---- | ---- | ------ | ------ |
| W1   | 10   | 24     | 8      |
| W2   | 14   | 30     | 12     |
| W3   | 9    | 28     | 15     |
| W4   | 16   | 35     | 18     |

{ .chart type=area stacked title="A month in the life" }

## Pie

One value column, one slice per row.

| Snack    | Share |
| -------- | ----- |
| Ants     | 70    |
| Termites | 20    |
| Grubs    | 10    |

{ .chart type=pie title="Diet" }

## Donut

`type=donut` is a pie with a hole in the middle.

| Activity | Hours |
| -------- | ----- |
| Sleeping | 14    |
| Foraging | 6     |
| Climbing | 3     |
| Rolling  | 1     |

{ .chart type=donut title="A typical day" }

## Hidden until revealed

A chart inside a tab or callout starts hidden, where it has no width to measure, so
it's drawn the moment you reveal it.

=== "Chart"
    | Scale | Count |
    | ----- | ----- |
    | Back  | 412   |
    | Tail  | 286   |
    | Legs  | 96    |

    { .chart type=bar legend=false title="Scales by region" }

=== "Just a table"
    No chart here, only prose.

!!! tip "Inside a callout"
    | Mood    | Days |
    | ------- | ---- |
    | Curious | 18   |
    | Sleepy  | 9    |
    | Grumpy  | 3    |

    { .chart type=donut legend=false title="Pango's month" }
