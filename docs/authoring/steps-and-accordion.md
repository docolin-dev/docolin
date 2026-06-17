---
title: Steps & accordion
description: Numbered vertical steppers for sequences, and exclusive collapsible rows for question-and-answer content.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/steps-accordion
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 6m

  status: stable

  aliases: [steps, stepper, walkthrough, accordion, faq, collapsible rows]

  prev: ./cards.md
  next: ./diagrams.md
---

# Steps & accordion

!!! info "In one line"
    A numbered stepper for a sequence followed in order, and an exclusive accordion for independent entries picked one at a time.

Two constructs for content that comes in pieces. **Steps** are for a sequence the reader follows in order, the way Pango climbs: sniff, grip, pull, repeat. An **accordion** is for independent pieces the reader picks from, where opening one tucks the last away.

## Steps

An ordered list inside `!!! steps` becomes a numbered vertical stepper. A title is optional.

```md
!!! steps
    1. Sniff the first bar
    2. Climb it anyway
    3. Bounce to the next bar
```

!!! cards
    - !!! steps
          1. Sniff the first bar
          2. Climb it anyway
          3. Bounce to the next bar

Steps can be rich. Each one holds whatever Markdown you need, code blocks, lists, prose, so a real walkthrough fits naturally.

````md
!!! steps "Install the driver"
    1. Add the repo, then install:

       ```bash
       sudo dnf install rpmfusion-free-release
       ```

    2. Pick your card from the list:

       - desktop GPU
       - laptop hybrid

    3. Reboot and run `nvidia-smi`
````

!!! cards
    - !!! steps "Install the driver"
          1. Add the repo, then install:

             ```bash
             sudo dnf install rpmfusion-free-release
             ```

          2. Pick your card from the list:

             - desktop GPU
             - laptop hybrid

          3. Reboot and run `nvidia-smi`

## Accordion

An unordered list inside `!!! accordion` becomes a group of collapsible rows. It is exclusive: opening one row closes the one that was open. Each item leads with a bold question, then a blank line, then the answer.

```md
!!! accordion
    - **How do I reset my key?**

      Open Settings, then Security, then Reset. A fresh key is emailed to you.

    - **Where are logs stored?**

      Under `~/.local/state/pango/`, rotated weekly.

    - **Can Pango work offline?**

      Yes. He hoards ants and runs without a network.
```

!!! cards
    - !!! accordion
          - **How do I reset my key?**

            Open Settings, then Security, then Reset. A fresh key is emailed to you.

          - **Where are logs stored?**

            Under `~/.local/state/pango/`, rotated weekly.

          - **Can Pango work offline?**

            Yes. He hoards ants and runs without a network.

## Which one (and which neither)

- **A sequence to follow in order?** Steps.
- **A set of independent entries, like an FAQ, where the reader wants one at a time?** Accordion.
- **A single optional aside?** Neither; a [collapsible callout](./callouts.md#collapsible-hatches) (`???`) is lighter than an accordion of one.

## Gotchas

- **Steps take an ordered list (`1.`); the accordion takes an unordered list (`-`).** The opener (`!!! steps` or `!!! accordion`) chooses the construct, so pair each with the list type it expects.
- **Four-space indent**, like every `!!!` block. Step or row content nests under its list item.
- **Blank line before a row's answer.** The bold question and its body need a blank line between them, or they run together on one line.
- **Don't hide the essential.** An accordion is great for reference a reader dips into, poor for steps everyone must read; collapsed content is content many readers never open.

## See also

- [Callouts](./callouts.md) for `???` collapsibles, the accordion's single-row cousin.
- [Content tabs](./tabs.md) for alternatives shown one at a time, side by side rather than stacked.
