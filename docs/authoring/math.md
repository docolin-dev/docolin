---
title: Math
description: Inline and display math written in LaTeX, rendered to HTML on the server with KaTeX, so equations load instantly with no client-side JavaScript.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/math
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: intermediate
  time_estimate: 5m

  status: stable

  aliases: [math, latex, katex, equations, formulas]

  prev: ./charts.md
  next: ./footnotes-and-annotations.md
---

# Math

!!! info "In one line"
    Inline and display math written in LaTeX, rendered to HTML on the server with KaTeX, no client-side typesetting to wait on.

When Pango works out how far a fall is before the curl reflex kicks in, prose won't do; he needs an equation. docolin renders LaTeX math with [KaTeX](https://katex.org), on the server, so a reader gets finished HTML plus the KaTeX stylesheet and never downloads the KaTeX JavaScript.

## Inline math

Wrap an expression in single `$` to set it in a line of text.

```md
The mass-energy relation $E = mc^2$, or Euler's identity $e^{i\pi} + 1 = 0$.
```

!!! cards
    - The mass-energy relation $E = mc^2$, or Euler's identity $e^{i\pi} + 1 = 0$.

## Display math

Wrap it in double `$$` on their own lines for a centred block.

```md
$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$
```

!!! cards
    - $$
      \int_0^1 x^2 \, dx = \frac{1}{3}
      $$

Bigger constructions, sums and matrices, work the same way:

```md
$$
\sum_{k=1}^{n} k = \frac{n(n + 1)}{2}
\qquad
\begin{bmatrix} a & b \\ c & d \end{bmatrix}
$$
```

!!! cards
    - $$
      \sum_{k=1}^{n} k = \frac{n(n + 1)}{2}
      \qquad
      \begin{bmatrix} a & b \\ c & d \end{bmatrix}
      $$

## Inside other constructs

Math nests anywhere prose does, in [callouts](./callouts.md), [tabs](./tabs.md), and [cards](./cards.md).

```md
!!! tip "A young Gauss"
    Asked to add $1$ through $100$, he saw $\sum_{k=1}^{100} k = 5050$.
```

!!! cards
    - !!! tip "A young Gauss"
          Asked to add $1$ through $100$, he saw $\sum_{k=1}^{100} k = 5050$.

## Gotchas

- **It's KaTeX, a subset of LaTeX.** The common commands are all there, but a few exotic packages are not. The [KaTeX support table](https://katex.org/docs/support_table) lists exactly what renders.
- **A literal dollar sign needs escaping.** Write `\$` when you mean money, so `$5` and `$10` don't get read as the start and end of an inline formula.
- **Rendered once, on the server.** The output is plain HTML, so it is fast and works without JavaScript; there is no client-side typesetting step to wait on.

## See also

- [Charts](./charts.md), for data; math is for the relationships behind it.
- [Text, lists, and links](./text-and-lists.md), for the prose the math sits inside.
