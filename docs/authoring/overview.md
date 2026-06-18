---
title: Writing docs with docolin
description: A guided tour of everything you can put in a docolin doco, taught by example through a pangolin and his jungle gym.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/overview
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 5m

  status: stable

  aliases: [authoring guide, writing guide, markdown guide, how to write docs]

  next: ./quickstart.md
---

# Writing docs with docolin

!!! info "In one line"
    A guided tour of everything you can put in a docolin doco, taught by example through a pangolin and his jungle gym.

Pango is a pangolin. He spends his nights in a jungle gym, climbing bars and hoarding ants, and he is also, as of last Tuesday, a technical writer, because somebody had to document the gym before a newcomer walked straight off the high bar.

This guide is how he learned. By the end of it you can write a docolin doco that is accurate, easy to scan, and genuinely pleasant to read, which is the whole point: docolin exists so that documentation is something people reach for, not something they endure.

## What you can build

A quick walk past the apparatus. Each card opens the page that teaches it.

!!! cards { cols=2 }
    - [Text, lists, and links](./text-and-lists.md){ icon=type }
      Headings, emphasis, lists, task lists, quotes, images, and inline icons. The bars everything else hangs from.

    - [Code blocks](./code-blocks.md){ icon=code }
      Syntax highlighting in any language, author highlights, and shareable line selection readers can link to.

    - [Callouts](./callouts.md){ icon=message-square-warning }
      Notes, tips, and warnings that a hurried reader cannot skim past, plus collapsible hatches for the long stuff.

    - [Content tabs](./tabs.md){ icon=panels-top-left }
      Group alternatives, like one install command per package manager, behind a single set of labels that stay in sync.

    - [Cards](./cards.md){ icon=layout-grid }
      Responsive grids of linked, typed, illustrated cards. Like this one.

    - [Diagrams & charts](./diagrams.md){ icon=git-branch }
      Mermaid flowcharts and data charts drawn straight from a Markdown table.

## A note on the examples

Pango runs the examples, the ants, the high bars, the occasional somersault, but every snippet here is real. What you see is exactly what renders, so you can lift any of it into your own doco and trust it to work.

The fastest way to learn a doco is to write one. Start with [your first doco](./quickstart.md), or pick a construct from the sidebar.
