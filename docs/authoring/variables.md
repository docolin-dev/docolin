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

Each input line is `name: Label { attributes }`. The name is what expressions use (letters, digits, underscores, starting with a letter); the label is what the reader sees. Place the card where the reader should stop and fill it, right after the intro or just before the section that needs it.

### Scope: one namespace per doco

- **Use as many cards as the guide needs.** A long walkthrough can put a "Server setup" card in one section and a "Client setup" card in another; every card feeds the same doco-wide variable set.
- **Everything sees everything.** A `{{ }}` anywhere can use a variable from any card, even one declared further down the page; where the card sits is presentation, not scope.
- **Declarations only live in cards.** Inputs and `:=` derived variables are always list items of an `!!! inputs` card, never loose in prose, but any card's derived variable can reference inputs from any other card.
- **A name is declared once.** Redeclaring it, in the same card or another one, keeps the first declaration and reports the repeat on the later card.

The attributes:

| Attribute        | Meaning                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type=`          | Validation: `text` (default), `number`, `url`, `hostname`, `color`, `date`, `select`, or `boolean`. `color` takes any CSS color, typed or picked from the built-in picker, and carries a live swatch wherever the value lands. `date` is `yyyy-mm-dd`, typed or picked from a calendar. `select` renders a dropdown of its `options`. `boolean` renders a switch and is a real boolean in expressions. |
| `secret`         | Password-masked with a reveal toggle. Never stored, memory only.                                                                                                                                                                                                                                                                                                                                       |
| `default="..."`  | Pre-filled value, used until the reader types something.                                                                                                                                                                                                                                                                                                                                               |
| `placeholder=`   | Hint text shown in the empty field.                                                                                                                                                                                                                                                                                                                                                                    |
| `min=` / `max=`  | Value bounds for `type=number`.                                                                                                                                                                                                                                                                                                                                                                        |
| `maxlen=`        | Maximum input length, any type.                                                                                                                                                                                                                                                                                                                                                                        |
| `options="a\|b"` | The choices for `type=select`, pipe-separated, shown in authored order.                                                                                                                                                                                                                                                                                                                                |

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

Unfilled values show as dashed placeholder chips (hover one to see why); filled values are tinted so the reader always sees exactly where their data landed. The code block's copy button copies the whole substituted command.

## The expression language

Deliberately tiny: pure expressions over your declared names, numbers, strings (`"..."`), and booleans. No loops, no property access, no way to reach anything outside the doco's own variables, by design, since expressions run on every reader's machine.

| What       | Syntax                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arithmetic | `+` `-` `*` `/` `%` (standard precedence, parentheses)                                                                                                                                                                                         |
| Comparison | `==` `!=` `<` `<=` `>` `>=`                                                                                                                                                                                                                    |
| Logic      | `&&` `\|\|` `!` and the ternary `cond ? a : b`                                                                                                                                                                                                 |
| Math       | `round(x, digits)` `min(...)` `max(...)` `abs(x)` `floor(x)` `ceil(x)` `sqrt(x)` `clamp(x, lo, hi)` `numberformat(n)`                                                                                                                          |
| Strings    | `upper(s)` `lower(s)` `trim(s)` `capitalize(s)` `length(s)` `contains(s, sub)` `startswith(s, p)` `endswith(s, p)` `replace(s, find, repl)` `slice(s, start, end)` `padstart(s, len, pad)` `padend(s, len, pad)` `urlencode(s)` `b64encode(s)` |
| Colors     | `tohex(c)` `torgb(c)` `tohsl(c)` `tooklch(c)` `lighten(c, amt)` `darken(c, amt)` `alpha(c, a)` `contrast(c)`                                                                                                                                   |
| Dates      | `today()` `dateadd(d, n, unit)` `datediff(from, to)` `weekday(d)` `dateformat(d, style)`                                                                                                                                                       |

Every function is pure, total, and bounded; `replace` is plain text replacement, never a pattern. Color functions take any hex/rgb/hsl/oklch value; the manipulation ones (`lighten`, `darken`, `alpha`) step in perceptual OKLCH and answer in the same format family they were given, so one accent input can derive a whole palette. Dates are `yyyy-mm-dd` strings; `dateadd` units are `days`/`weeks`/`months`/`years` (month math clamps, so Jan 31 plus one month is Feb 28), `datediff` counts days, and `dateformat` styles are `full`/`long`/`medium`/`short` in the reader's locale.

One deliberate exception to "same value for everyone": `today()` is the reader's calendar day, frozen for a whole update pass so every expression on the page agrees. A doco can say "your cert expires in `{{ datediff(today(), expiry) }}` days" and stay live for each reader, which also means a copied snapshot is only true on the day it was copied.

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

## Choices and switches

A `select` gives the reader a fixed choice, and a `boolean` is a switch that flips whole passages through ternaries. Together they cover the "which distro / which region / TLS on or off" pattern that otherwise forks a guide into parallel copies:

```md novars
!!! inputs "Where and how"
    - region: Region { type=select options="us-east|eu-west|ap-south" default=eu-west }
    - tls: TLS { type=boolean default=true }
    - scheme := tls ? "https" : "http"
```

!!! output "Rendered"
    !!! inputs "Where and how"
        - region: Region { type=select options="us-east|eu-west|ap-south" default=eu-west }
        - tls: TLS { type=boolean default=true }
        - scheme := tls ? "https" : "http"

    Your farm talks {{ scheme }} to **{{ region }}**, which is {{ tls ? "encrypted, good" : "unencrypted, only do this in a lab" }}.

## Colors and dates, live

A `type=color` input opens docolin's picker (or takes any typed CSS color), and every chip holding a color value carries a live swatch and copies on click, exactly like an inline color. A `type=date` input opens a calendar. Both feed the same expression language:

```md novars
!!! inputs "Look and feel"
    - accent: Accent { type=color default="#d97706" }
    - launch: Launch day { type=date default="2026-08-01" }
    - hover := lighten(accent, 0.1)
    - countdown := datediff(today(), launch)
```

!!! output "Rendered"
    !!! inputs "Look and feel"
        - accent: Accent { type=color default="#d97706" }
        - launch: Launch day { type=date default="2026-08-01" }
        - hover := lighten(accent, 0.1)
        - countdown := datediff(today(), launch)

    Your accent is {{ accent }}, hover state {{ hover }}, text on it {{ contrast(accent) }}. Launch is {{ dateformat(launch, "long") }}, {{ countdown }} days from today.

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
