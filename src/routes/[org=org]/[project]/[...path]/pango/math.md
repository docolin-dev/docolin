---
title: Math (LaTeX)
description: Inline $...$ and block $$...$$ math, rendered to HTML server-side with KaTeX.
---

Inline math drops into a sentence: the mass-energy relation $E = mc^2$, or Euler's
identity $e^{i\pi} + 1 = 0$. It is rendered server-side, so readers get HTML and
the KaTeX CSS, never the KaTeX JavaScript.

## Block math

Display equations get their own centered block:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

A sum, and a matrix:

$$
\sum_{k=1}^{n} k = \frac{n(n + 1)}{2}
\qquad
\begin{bmatrix} a & b \\ c & d \end{bmatrix}
$$

## Inside other constructs

Math nests in callouts, tabs, and cards like anything else:

!!! tip "A young Gauss"
    Asked to add $1$ through $100$, he saw $\sum_{k=1}^{100} k = \frac{100 \cdot 101}{2} = 5050$.

=== "Quadratic"
    $$
    x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
    $$

=== "Gaussian"
    $$
    \int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
    $$
