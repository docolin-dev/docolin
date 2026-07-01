---
title: Tables
description: GFM tables with column alignment and rich cell content, plus the one-line trick that turns a table into a bar or line chart docolin renders for you.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/tables
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 5m

  status: stable

  aliases: [tables, gfm tables, column alignment, data tables]

  prev: ./text-and-lists.md
  next: ./code-blocks.md
---

# Tables

!!! info "In one line"
    GitHub-flavored Markdown tables, with column alignment, rich cells, and the one-line trick that turns any table into a chart.

Pango keeps a logbook: snacks eaten, bars climbed, naps taken. A table is how that goes into a doco. docolin uses GitHub-Flavored Markdown tables, and they earn an extra trick here: any table can be [drawn as a chart](./charts.md).

## A basic table

A header row, a separator row of dashes, then one row per record. The pipes do not need to line up, but it reads better when they do.

```md
| Snack        | Crunch | Pango's rating |
| ------------ | ------ | -------------- |
| Black ants   | high   | 5/5            |
| Termites     | medium | 4/5            |
| Mystery grub | ???    | 3/5            |
```

!!! cards
    - | Snack        | Crunch | Pango's rating |
      | ------------ | ------ | -------------- |
      | Black ants   | high   | 5/5            |
      | Termites     | medium | 4/5            |
      | Mystery grub | ???    | 3/5            |

## Column alignment

Colons in the separator row set each column's alignment: left (the default), center, or right.

```md
| Left  | Center | Right |
| :---- | :----: | ----: |
| ants  |  many  |    70 |
| grubs |  few   |    10 |
```

!!! cards
    - | Left  | Center | Right |
      | :---- | :----: | ----: |
      | ants  |  many  |    70 |
      | grubs |   few  |    10 |

Right-align columns of numbers so the digits line up by place value; it makes them far easier to compare down a column.

## Rich cells

Cells take inline Markdown: emphasis, `code`, links, even an inline icon like `:paw-print:`.

```md
| Command       | What it does           |
| ------------- | ---------------------- |
| `pango climb` | Goes **up** :arrow-up: |
| `pango roll`  | The _involuntary_ one  |
| [docs](/docolin/docolin/authoring/overview) | Sends you here |
```

!!! cards
    - | Command                                     | What it does           |
      | ------------------------------------------- | ---------------------- |
      | `pango climb`                               | Goes **up** :arrow-up: |
      | `pango roll`                                | The _involuntary_ one  |
      | [docs](/docolin/docolin/authoring/overview) | Sends you here         |

## From table to chart

Add a single `{ .chart ... }` line right after a table and docolin paints a chart on top of it. The table stays in the page as the underlying data (and the no-JS, screen-reader, and AI-readable view). The first column becomes the x-axis; every other column becomes a series.

```md
| Month | Ants | Termites |
| ----- | ---- | -------- |
| Jan   | 186  | 80       |
| Feb   | 305  | 200      |

{ .chart type=bar title="Snacks per month" }
```

!!! cards
    - | Month | Ants | Termites |
      | ----- | ---- | -------- |
      | Jan   | 186  | 80       |
      | Feb   | 305  | 200      |

      { .chart type=bar title="Snacks per month" }

The full set of chart types and options lives on the [Charts](./charts.md) page.

## Gotchas

- **Tables do not nest** and cannot hold block content (no lists, no code blocks, no callouts inside a cell). For anything richer, reach for [cards](./cards.md) or [steps](./steps-and-accordion.md).
- **Wide tables scroll** on narrow screens rather than squashing. If a table is wide because it has many columns, ask whether a chart or a restructure would read better.
- **The separator row is required.** A header row with no `---` line under it is just a paragraph full of pipes.

## See also

- [Charts](./charts.md), the same data drawn as bars, lines, areas, or pie slices.
- [Text, lists, and links](./text-and-lists.md) for the inline Markdown that lives inside cells.
