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
