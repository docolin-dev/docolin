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
