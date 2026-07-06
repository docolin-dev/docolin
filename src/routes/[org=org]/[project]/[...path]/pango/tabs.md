---
title: Content tabs
description: MkDocs-style === tabs, including synced tabbed code, rich panels, and a lone tab.
---

Tabs group alternatives behind one set of labels. Write consecutive `=== "Label"`
blocks, each with a 4-space-indented body; adjacent ones become one tabbed set.

=== "Linux"
    Pango installs ants via the system package manager.

=== "macOS"
    Pango prefers a fresh jar of ants from Homebrew.

=== "Windows"
    Pango tolerates ants from the Microsoft Store, grudgingly.

## Synced tabbed code

Below are **two** package-manager blocks. Pick a manager in one and the other
follows, sets sync by their shared labels, and the choice is remembered across
visits. The panels are full code blocks, so the header bar, copy button, and line
selection all work inside a tab.

First, installing:

=== "npm"
    ```bash
    npm install pangolin
    ```

=== "pnpm"
    ```bash
    pnpm add pangolin
    ```

=== "yarn"
    ```bash
    yarn add pangolin
    ```

=== "bun"
    ```bash
    bun add pangolin
    ```

Then, running, switch a tab above and this block jumps to match (and vice versa):

=== "npm"
    ```bash
    npm run climb
    ```

=== "pnpm"
    ```bash
    pnpm run climb
    ```

=== "yarn"
    ```bash
    yarn climb
    ```

=== "bun"
    ```bash
    bun run climb
    ```

## Rich panels

A panel holds any markdown, including other constructs.

=== "Overview"
    Pangolins are the only mammals **wholly covered in scales**.

    - Nocturnal
    - Toothless
    - Excellent climbers

=== "Care"
    !!! warning "Handle gently"
        A frightened pango rolls into a ball. Do not unroll it by force.

=== "Diet"
    | Meal     | Amount |
    | -------- | ------ |
    | Ants     | 70%    |
    | Termites | 30%    |

## A lone tab

A single `===` block is still a (one-tab) set, no special-casing.

=== "Just one"
    Nothing to switch to, but it renders as a tab all the same.

## Edge cases (try to break it)

Ten tabs. Panels are uncapped; only the active-underline cosmetic caps at eight.

=== "one"
    1

=== "two"
    2

=== "three"
    3

=== "four"
    4

=== "five"
    5

=== "six"
    6

=== "seven"
    7

=== "eight"
    8

=== "nine"
    9

=== "ten"
    10

Tabs inside tabs:

=== "Outer A"
    === "Inner A1"
        Deeply nested content.

    === "Inner A2"
        A sibling inner tab.

=== "Outer B"
    Just text in the second outer tab.

A callout in one tab; code with line numbers and a highlight in another:

=== "Callout"
    !!! tip "Inside a tab"
        Constructs nest fine in a panel.

=== "Code"
    ```python title="climb.py" linenums="1" hl_lines="2"
    def climb(height):
        return height * 2  # the important line
    ```

Odd labels (emoji, symbols, length):

=== "🚀 Launch"
    An emoji in the label.

=== "C++"
    A symbol in the label.

=== "A rather long tab label that just keeps going and going and going"
    Long labels should wrap, not overflow the bar.

Tabs living inside a card, and a tab whose only content is a code block:

!!! cards
    - === "First"
          Tabs inside a card.

      === "Second"
          The card's second tab.

=== "Code only"
    ```bash
    echo "no surrounding prose"
    ```

A grouping boundary: a callout between two runs splits them into separate sets.

=== "Run 1"
    The first run ends here.

!!! note
    I interrupt the run.

=== "Run 2"
    A separate set, not part of run 1.

## Tall panels (scroll-jump regression)

Each panel here is intentionally huge. The historical bug: picking any tab but
the first scrolled the page far away, because the click focused a hidden radio
whose box sat after the previous tab's tall panel, and the browser dutifully
scrolled to it. Click every label below; the page must not move at all.

=== "Bamboo route"
    Pango starts every session on the bamboo route, and he warms up properly.

    - Stretch the tail, twice
    - Count the scales (all of them)
    - One practice curl

    ```text
    bamboo segment 01: grip check
    bamboo segment 02: grip check
    bamboo segment 03: grip check
    bamboo segment 04: grip check
    bamboo segment 05: grip check
    bamboo segment 06: grip check
    bamboo segment 07: grip check
    bamboo segment 08: grip check
    bamboo segment 09: grip check
    bamboo segment 10: grip check
    bamboo segment 11: grip check
    bamboo segment 12: grip check
    bamboo segment 13: grip check
    bamboo segment 14: grip check
    bamboo segment 15: grip check
    bamboo segment 16: grip check
    bamboo segment 17: grip check
    bamboo segment 18: grip check
    bamboo segment 19: grip check
    bamboo segment 20: grip check
    ```

    !!! note "Route log"
        The bamboo route has never once defeated Pango. The reverse has
        occurred on several documented occasions.

    And a closing paragraph so the panel ends in prose, not a block, because
    real pages do that and the panel height should account for it.

=== "Rope bridge"
    The rope bridge is the long one. It has a beginning, a middle that goes on
    for quite a while, and an end that Pango has reportedly seen twice.

    1. Approach the bridge with confidence
    2. Lose the confidence around the middle
    3. Recover it by thinking about termites
    4. Finish the crossing anyway
    5. Celebrate with exactly one ant

    | Section  | Length | Wobble factor |
    | -------- | ------ | ------------- |
    | Entry    | 3 m    | mild          |
    | Middle   | 11 m   | considerable  |
    | Far side | 3 m    | mild again    |

    !!! tip "Crossing tip"
        Do not look down. There is nothing down there but more documentation.

    Some more prose to keep this panel tall. The rope bridge was donated by a
    generous colony of weaver ants who were later eaten, which everyone agrees
    was in poor taste. A memorial plaque hangs at the midpoint. Pango nods at
    it respectfully on every crossing, which does not help the wobble.

=== "High bar"
    The high bar panel is mostly a very long checklist, because checklists make
    everything feel achievable, even a four-meter drop.

    - [ ] Chalk the claws
    - [ ] Chalk the tail (controversial)
    - [ ] Address the bar by name
    - [ ] Jump
    - [ ] Regret
    - [ ] Grip
    - [ ] Swing once
    - [ ] Swing twice
    - [ ] Dismount with style
    - [ ] Land on the crash mat
    - [ ] Claim that was the plan all along

    ```text
    attempt 001: bar 1, pango 0
    attempt 002: bar 2, pango 0
    attempt 003: bar 3, pango 0
    attempt 004: bar 4, pango 0
    attempt 005: bar 4, pango 1 (!)
    attempt 006: bar 5, pango 1
    attempt 007: bar 6, pango 1
    attempt 008: bar 6, pango 2
    attempt 009: bar 6, pango 3
    attempt 010: pango declared moral victor
    ```

    The scoreboard is maintained by an impartial committee of one pangolin.

=== "Rest ledge"
    The shortest panel, on purpose: switching from a tall panel to this one
    shrinks the set dramatically, which is exactly when a scroll bug would
    show itself. The page still must not move.
