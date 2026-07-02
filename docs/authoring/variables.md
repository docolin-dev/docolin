---
title: Interactive variables
description: Declare inputs once and use expressions anywhere; the reader fills in their values and the whole doco, commands, prose, tables, even charts, recomputes in their browser.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/variables
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 9m

  status: stable

  aliases:
    [
      interactive variables,
      inputs,
      expressions,
      placeholders,
      fill in,
      api key,
      auto math,
      computed values,
    ]

  prev: ./steps-and-accordion.md
  next: ./diagrams.md
---

# Interactive variables

!!! info "In one line"
    Declare inputs in a card, write `{{ expr }}` anywhere, and the reader's values flow through the whole doco, commands, prose, tables, charts, live in their browser.

Every install guide has the same wart: `<YOUR_API_KEY>` sprinkled through the commands, and a reader mentally substituting it in six places, fumbling one. Interactive variables fix that. The reader fills a field once, and every command, sentence, table, and chart that uses it becomes theirs.

Everything happens in the reader's browser: values are never sent anywhere, never rendered on the server, and secret fields are never even written to disk. This page is itself live, fill the card below and watch it react.

## The inputs card

Open a card with `!!! inputs`, one list item per variable:

```md novars
!!! inputs "Try it"
    - farm: Farm name { default="Pango's Ant Farm" }
    - ants: Ants per day { type=number min=1 default=50000 }
    - key: API key { secret placeholder="pgo-..." }
    - host: Server { type=url default="https://antfarm.example.com" }
    - feed_url := host + "/v1/feed?key=" + urlencode(key)
```

!!! output "Rendered"
    !!! inputs "Try it"
        - farm: Farm name { default="Pango's Ant Farm" }
        - ants: Ants per day { type=number min=1 default=50000 }
        - key: API key { secret placeholder="pgo-..." }
        - host: Server { type=url default="<https://antfarm.example.com>" }
        - feed\_url := host + "/v1/feed?key=" + urlencode(key)

    **{{ farm }}** handles **{{ ants }}** ants a day, {{ round(ants / 86400, 2) }} a second.

Each input line is `name: Label { attributes }`. The name is what expressions use (letters, digits, underscores, starting with a letter); the label is what the reader sees. Place the card where the reader should stop and fill it, right after the intro or just before the section that needs it, and use several cards if a long guide has several setups. Names are shared across the whole doco.

The attributes:

| Attribute       | Meaning                                                          |
| --------------- | ---------------------------------------------------------------- |
| `type=`         | Validation: `text` (default), `number`, `url`, or `hostname`.    |
| `secret`        | Password-masked with a reveal toggle. Never stored, memory only. |
| `default="..."` | Pre-filled value, used until the reader types something.         |
| `placeholder=`  | Hint text shown in the empty field.                              |
| `min=` / `max=` | Value bounds for `type=number`.                                  |
| `maxlen=`       | Maximum input length, any type.                                  |

## Computed variables

A `name := expression` line declares a hidden variable derived from the others, evaluated in dependency order (declaration order doesn't matter, and cycles are reported instead of spinning). Readers can peek at them through the card's "Derived values" disclosure, so nothing about their data is invisible.

```md novars
- feed_url := host + "/v1/feed?key=" + urlencode(key)
- per_hour := round(ants / 24)
```

Always run secrets that end up in URLs through `urlencode()`, exactly as you would in a shell.

## Using values

Write `{{ expr }}` in prose or inside any code block. Full expressions work, not just names:

````md novars
Feed the farm ({{ ants }} ants/day, {{ round(ants / 24) }} per hour):

```bash
curl -X POST "{{ feed_url }}" --data '{"antsPerDay": {{ ants }}}'
```
````

!!! output "Rendered"
    Feed the farm ({{ ants }} ants/day, {{ round(ants / 24) }} per hour):

    ```bash
    curl -X POST "{{ feed_url }}" --data '{"antsPerDay": {{ ants }}}'
    ```

Unfilled values show as dashed placeholder chips, and clicking one jumps to its input. Filled values are tinted so the reader always sees exactly where their data landed, and the copy button copies the substituted command.

## The expression language

Deliberately tiny: pure expressions over your declared names, numbers, strings (`"..."`), and booleans. No loops, no property access, no way to reach anything outside the doco's own variables, by design, since expressions run on every reader's machine.

| What       | Syntax                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| Arithmetic | `+` `-` `*` `/` `%` (standard precedence, parentheses)                                  |
| Comparison | `==` `!=` `<` `<=` `>` `>=`                                                             |
| Logic      | `&&` `\|\|` `!` and the ternary `cond ? a : b`                                          |
| Functions  | `round(x, digits)` `min(...)` `max(...)` `upper(s)` `lower(s)` `trim(s)` `urlencode(s)` |

Three rules keep results predictable: `+` concatenates when either side is a string and adds otherwise; `==` is strict (no type juggling); ordering comparisons require both sides to be the same type, mixing is an error. A math slip like dividing a string shows `NaN` honestly, and a genuinely broken expression renders an error chip whose hover explains itself, never a broken page.

## Tables and charts recompute

Chips work in table cells, and a [chart](./charts.md) drawn from a table with expression cells redraws as the reader types:

```md novars
| Shift | Ants                       |
| ----- | -------------------------- |
| Day   | {{ round(ants * 0.7) }}    |
| Night | {{ round(ants * 0.3) }}    |

{ .chart type=bar title="Who eats when" }
```

!!! output "Rendered"
    | Shift | Ants                     |
    | ----- | ------------------------ |
    | Day   | {{ round(ants \* 0.7) }} |
    | Night | {{ round(ants \* 0.3) }} |

    { .chart type=bar title="Who eats when" }

## What never substitutes

Substitution is strictly opt-in, so docs **about** template languages are safe:

- A doco with no inputs card has no substitution at all; every `{{ }}` is literal.
- Only expressions whose names are all declared substitute. Dotted or dashed names can never be declared, so Helm's `{{ .Values.replicas }}` or a Jinja filter stays literal text automatically, even in a doco that uses variables.
- A code fence can opt out entirely with `novars` on the opening fence, even for declared names. (Every syntax example on this page uses it.)

## Validation and privacy

Typed inputs validate as the reader leaves the field, with a specific message under it. And the privacy contract is absolute: values are resolved client-side only; non-secret inputs persist in the reader's own browser storage so a revisit keeps their hostname (the card's Reset clears it); `secret` inputs live in memory only and are gone when the tab closes.

## Gotchas

- **Four spaces, one list.** The card body follows admonition rules: list items indented four spaces, nothing else in the card.
- **Typos stay literal.** `{{ prot }}` when you declared `port` renders as plain text, that is the collision-safety rule doing its job. The [local preview](./preview.md) flags expressions referencing undeclared names, so check it before publishing.
- **Reserved names.** `true`, `false`, and the seven function names can't be variable names.
- **Don't overdo the math.** A doco is still prose; a value the reader can compute in their head reads better as a sentence than as an expression.

## See also

- [Callouts](./callouts.md), the block family the inputs card belongs to.
- [Charts](./charts.md), for the tables that redraw with reader values.
- [Code blocks](./code-blocks.md), where substituted commands meet the copy button and shareable lines.
