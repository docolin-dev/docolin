---
title: Callouts
description: Notes, tips, and warnings readers cannot skim past, plus collapsible sections that tuck away the long stuff, all from one simple block syntax.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/callouts
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 6m

  status: stable

  aliases: [admonitions, notes, warnings, callout boxes, collapsible]

  prev: ./code-blocks.md
  next: ./tabs.md
---

# Callouts

!!! info "In one line"
    Notes, tips, and warnings a hurried reader can't skim past, plus collapsible hatches for the optional stuff.

The high bars get slippery, and Pango learned that the hard way. The first thing he ever wrote down was a warning, and he refused to bury it in a paragraph where a sleepy climber would skim straight past it. He wanted it _loud_. That is what a callout is for: pulling one important thing out of the flow so the eye cannot miss it.

## Admonitions

Open a callout with three exclamation marks, a type, and an optional quoted title. Indent the body four spaces; everything indented under the opener belongs to the callout.

```md
!!! warning "Chalk up first"
    The high bars get slippery after the 1,000th ant.
```

!!! cards
    - !!! warning "Chalk up first"
          The high bars get slippery after the 1,000th ant.

Drop the title and the type's own name becomes the heading:

```md
!!! note
    Scales are self-cleaning. Please do not polish the pangolin.
```

!!! cards
    - !!! note
          Scales are self-cleaning. Please do not polish the pangolin.

### The six types

Pick by what you mean, not by which colour you like. Readers (and screen readers) learn the meanings fast, so using `danger` for a mild aside just cries wolf.

```md
!!! note
    Neutral aside. Context the reader may want, but can live without.

!!! info
    Background worth knowing. A little more weight than a note.

!!! tip
    A shortcut, a better way, a thing Pango wishes he'd known sooner.

!!! check
    Something is confirmed working, finished, or verified. Same green tint as
    `tip`, but the check icon reads as "yes, this is the right thing."

!!! warning
    Proceed carefully. Something here bites if you ignore it.

!!! danger
    Stop and read. Real consequences: data loss, broken systems, lost claws.
```

!!! cards
    - !!! note
          Neutral aside. Context the reader may want, but can live without.

      !!! info
          Background worth knowing. A little more weight than a note.

      !!! tip
          A shortcut, a better way, a thing Pango wishes he'd known sooner.

      !!! check
          Something is confirmed working, finished, or verified. Same green tint as `tip`, but the check icon reads as "yes, this is the right thing."

      !!! warning
          Proceed carefully. Something here bites if you ignore it.

      !!! danger
          Stop and read. Real consequences: data loss, broken systems, lost claws.

### Rich bodies

A callout body is full Markdown. Lists, code, tables, even other callouts all work, as long as they stay indented under the opener.

````md
!!! danger "Do not unroll a pangolin"
    Do **not** unroll a curled pangolin. It can wait you out for hours, and it
    will:

    - ignore you completely
    - win

    ```bash
    # the only correct move
    leave-some-ants && back-away-slowly
    ```
````

!!! cards
    - !!! danger "Do not unroll a pangolin"
          Do **not** unroll a curled pangolin. It can wait you out for hours, and it will:

          - ignore you completely
          - win

          ```bash
          # the only correct move
          leave-some-ants && back-away-slowly
          ```

## Collapsible hatches

Some equipment only opens when Pango pokes it. Swap the `!!!` for `???` and the callout becomes collapsible, closed by default, so optional detail stays out of the way until a reader wants it.

```md
??? note "What's behind the loose scale?"
    A spare snack and a folded map of every air vent. Standard pangolin
    contingency planning.
```

!!! cards
    - ??? note "What's behind the loose scale?"
          A spare snack and a folded map of every air vent. Standard pangolin contingency planning.

Add a `+` (`???+`) to start it open. Same collapsible behaviour, but the reader sees the content first and can fold it away.

```md
???+ warning "Read before the high bars"
    Chalk first. The fall is short but the somersault is involuntary.
```

!!! cards
    - ???+ warning "Read before the high bars"
          Chalk first. The fall is short but the somersault is involuntary.

Reach for a hatch when the content is genuinely optional: a long aside, a troubleshooting dump, a "why does this work" tangent. For a one-liner that everyone should read, a plain `!!!` callout is better; never hide the important thing behind a click.

## Nesting

Callouts nest inside each other and inside other constructs. Keep adding four spaces of indentation per level.

```md
!!! info "Open the hatch"
    Some intro, then a collapsible inside the callout:

    ??? tip "Click to expand"
        Hidden tip content, two levels deep.
```

!!! cards
    - !!! info "Open the hatch"
          Some intro, then a collapsible inside the callout:

          ??? tip "Click to expand"
              Hidden tip content, two levels deep.

## A typo degrades gracefully

Write a type docolin doesn't know and the callout falls back to a neutral box instead of vanishing, so the mistake surfaces where you can see it.

```md
!!! mistery "Not a real type"
    `mistery` isn't a type, so this renders as a plain box. Spot the typo,
    fix it to `mystery`... which also isn't a type. Use one of the six.
```

!!! cards
    - !!! mistery "Not a real type"
          `mistery` isn't a type, so this renders as a plain box. Spot the typo, fix it to `mystery`... which also isn't a type. Use one of the six.

## Gotchas

- **Four spaces, always.** The body must be indented four spaces under the opener. Three spaces, or a tab that isn't four wide, and the line falls out of the callout.
- **A blank line between callouts** keeps two stacked callouts from merging. (You can see the gaps in the six-types example above.)
- **Don't decorate.** A page where every second paragraph is a callout has no callouts, just loud paragraphs. Save them for the things a reader truly must not miss.

## See also

- [Cards](./cards.md) can be typed with the same six colours, for when the highlight is a whole linked panel rather than a line of prose.
- [Steps](./steps-and-accordion.md) covers the accordion, a close cousin of the collapsible hatch for grouped question-and-answer content.
