---
title: Nesting & edge cases
description: The stress test. Callouts in callouts, collapsibles in callouts, deep nesting, rich content, unknown types, and constructs inside constructs.
---

## Callout inside a callout

!!! note "Outer note"
    Outer body, then a nested warning:

    !!! warning "Nested warning"
        The nested body, with a list:

        - one
        - two

## Collapsible inside a callout

!!! info "Open the hatch"
    Some intro, then a collapsible:

    ??? tip "Click to expand"
        Hidden tip content.

## Callout inside a collapsible

???+ danger "Heads up, open by default"
    Read this, then dig deeper:

    !!! note "Buried note"
        You found it.

## Three levels deep

!!! note "Level one"
    !!! info "Level two"
        !!! tip "Level three"
            All the way down.

## Everything inside one callout

!!! tip "The whole gym in a box"
    A paragraph with **bold**, _italic_, and `code`.

    1. an ordered step
    2. another one

    | col a | col b |
    | ----- | ----- |
    | 1     | 2     |

    ```ts
    const deep = true;
    ```

    > a quote, for good measure

## An unknown type degrades

!!! mystery "Not a real type"
    Unknown types fall back to a neutral box, so a typo surfaces instead of vanishing.

## A construct inside a callout

!!! note "A stepper in a note"
    !!! steps
        1. first
        2. second
        3. third
