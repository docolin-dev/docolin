---
title: Crazy nesting
description: The deep end. Cards inside cards, a construct in every card, callouts in cards, grids in collapsibles. None of this should appear in real docs, but it must not break.
---

## Cards inside cards

!!! cards { cols=2 }
    - **Outer one**

      !!! cards { cols=2 }
          - inner a
          - inner b
    - **Outer two**

      Just text, no surprises.

## A construct in every card

!!! cards { cols=2 }
    - **An accordion**

      !!! accordion
          - First question

            First answer.
          - Second question

            Second answer.
    - **A stepper**

      !!! steps
          1. one
          2. two
          3. three

## A callout inside a card

!!! cards
    - **Heads up card**

      !!! warning "Careful"
          This warning lives inside a card.
    - **A plain card**

      Nothing nested here.

## A card grid inside a collapsible

???+ note "Open me for a grid"
    !!! cards { cols=3 }
        - alpha
        - beta
        - gamma

## A stepper inside a collapsible callout

??? tip "The steps are hidden until you click"
    !!! steps "Reveal the routine"
        1. Sniff
        2. Climb
        3. Roll

## A diagram in every hidden box

Mermaid measures its container, so a diagram in a hidden tab or a closed row would
draw at zero width. These start hidden and must still come out right the first time
they're revealed.

A tab that hides a diagram, next to one that doesn't:

=== "With a map"
    ```mermaid
    graph TD
        A --> B --> C
    ```

=== "Without one"
    Just prose, no diagram here.

A collapsible that hides a diagram until opened:

??? note "Open for a map"
    ```mermaid
    sequenceDiagram
        Reader->>Page: open
        Page-->>Reader: a freshly drawn diagram
    ```

A stepper where each step carries its own diagram (steps are visible, so these draw
on load):

!!! steps
    1. Up

       ```mermaid
       graph LR
           ground --> top
       ```

    2. Down

       ```mermaid
       graph RL
           top --> ground
       ```

A diagram inside a card:

!!! cards { cols=2 }
    - **A mapped card**

      ```mermaid
      graph TD
          Card --> Diagram
      ```
    - **A plain card**

      No diagram, just text.

Two levels of hiding: a tabbed set inside a collapsible. Open it, then switch tabs,
each diagram draws only once both its wrappers are open.

??? tip "Open, then switch tabs"
    === "First"
        ```mermaid
        graph TD
            X --> Y
        ```

    === "Second"
        ```mermaid
        graph TD
            P --> Q
        ```

## A chart in every hidden box

Charts measure their container, so one in a hidden tab or a closed row could draw at
a bad size. They hold their last size, so these must come out right when revealed.

A chart inside a tab, next to a plain one:

=== "Charted"
    | Bar | Height |
    | --- | ------ |
    | A   | 12     |
    | B   | 19     |
    | C   | 7      |

    { .chart type=bar legend=false title="Bars in a tab" }

=== "Plain"
    No chart here.

A chart inside a collapsible:

??? note "Open for a chart"
    | Week | Climbs |
    | ---- | ------ |
    | W1   | 4      |
    | W2   | 9      |
    | W3   | 6      |

    { .chart type=area legend=false title="Climbs over weeks" }

A chart inside an accordion row:

!!! accordion
    - **Show the numbers**

      | Snack    | Share |
      | -------- | ----- |
      | Ants     | 70    |
      | Termites | 30    |

      { .chart type=donut legend=false title="Diet" }

A chart inside a card:

!!! cards { cols=2 }
    - **A charted card**

      | x | y |
      | - | - |
      | a | 3 |
      | b | 5 |

      { .chart type=line legend=false }
    - **A plain card**

      No chart, just text.

Two levels of hiding: a chart in a tab inside a collapsible.

??? tip "Open, then switch tabs"
    === "One"
        | t | v |
        | - | - |
        | a | 2 |
        | b | 6 |

        { .chart type=bar legend=false }

    === "Two"
        | t | v |
        | - | - |
        | a | 5 |
        | b | 1 |

        { .chart type=bar legend=false }

## Charts with awkward data

More series than the five-color palette (colors cycle), and negative values:

| Month | A  | B  | C  | D  | E  | F  |
| ----- | -- | -- | -- | -- | -- | -- |
| Jan   | 5  | -3 | 8  | 2  | -1 | 4  |
| Feb   | 7  | 1  | -2 | 6  | 3  | -5 |
| Mar   | -4 | 9  | 3  | -1 | 8  | 2  |

{ .chart type=line title="Six series, some negative" }

A single data point, a single series, and a thousands separator:

| Region | Users |
| ------ | ----- |
| Global | 1,284 |

{ .chart type=bar legend=false title="One bar" }

Long category labels that have to share the axis:

| Distribution                  | Downloads |
| ----------------------------- | --------- |
| A rather long distro name one | 120       |
| Another long distribution two | 86        |
| Yet another long distro three | 54        |

{ .chart type=bar horizontal legend=false title="Long labels" }
