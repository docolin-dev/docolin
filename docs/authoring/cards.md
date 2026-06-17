---
title: Cards
description: A Markdown list inside !!! cards becomes a responsive grid of linked cards, each with an icon, an optional type color, and a column or horizontal layout.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/cards
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 7m

  status: stable

  aliases: [cards, card grid, link cards, landing page]

  prev: ./tabs.md
  next: ./steps-and-accordion.md
---

# Cards

!!! info "In one line"
    A list inside `!!! cards` becomes a responsive grid of linked, typed, illustrated cards.

When Pango wants to point a reader at three places at once, a bullet list of links feels thin. Cards turn that list into a grid of tap targets, each with an icon, a description, and a whole-card click area. They are what the [overview](./overview.md) page uses for its tour.

## Anatomy

Put a list inside `!!! cards`. Each item is one card: a **title**, an optional `{ ... }` of options, then a description on the following lines.

- A `[Link](url)` title makes the whole card clickable.
- A `**Bold**` title makes a static, non-clickable card.
- Grid-wide options, like the column count, go on the `!!! cards` opener.

## Icons and links

`{ icon=name }` takes any [Lucide](https://lucide.dev/icons) icon. The entire card is one hit area, so the reader can aim anywhere on it.

```md
!!! cards { cols=2 }
    - [Get started](./quickstart.md){ icon=rocket }
      Set up in five minutes with the quickstart.

    - [Code bars](./code-blocks.md){ icon=code }
      Every language Shiki can highlight.
```

!!! cards
    - !!! cards { cols=2 }
          - [Get started](./quickstart.md){ icon=rocket }
            Set up in five minutes with the quickstart.

          - [Code bars](./code-blocks.md){ icon=code }
            Every language Shiki can highlight.

### Multi-set icons

A bare name like `{ icon=rocket }` looks in **Lucide first**, then falls back to **Font Awesome** if Lucide doesn't have it. That covers most names, including brand glyphs (`{ icon=github }`) Lucide doesn't ship.

To force a specific set, prefix the name with a short set tag joined by a hyphen:

| Prefix | Set                                                                 |
| ------ | ------------------------------------------------------------------- |
| `fa-`  | Font Awesome (the regular outline style, like Mintlify)             |
| `tb-`  | Tabler (resolves through Font Awesome today; see note below)        |
| `lu-`  | Lucide (force Lucide even when a Font Awesome icon shares the name) |

```md
!!! cards { cols=2 }
    - **Lucide-first**{ icon=zap }
      A bare name picks Lucide if it has the glyph.

    - **Force Font Awesome**{ icon=fa-bolt }
      `fa-` forces FA's outline style, the same look Mintlify uses.
```

!!! cards
    - !!! cards { cols=2 }
          - **Lucide-first**{ icon=zap }
            A bare name picks Lucide if it has the glyph.

          - **Force Font Awesome**{ icon=fa-bolt }
            `fa-` forces FA's outline style, the same look Mintlify uses.

The prefix syntax is a hyphen, not a colon, because the inline `:icon:` shortcode in body text already uses colons as its delimiters. Inline shortcodes therefore only accept bare names; for a specific set, switch to a card.

!!! note "Tabler resolution"
    Tabler isn't bundled as a separate pack today. A `tb-name` falls through to Font Awesome, which has wide overlap with Tabler's outline glyphs. A native Tabler pack may ship later; existing `tb-` icons will then pick up the native glyph automatically.

## Typed cards

`{ type=... }` themes a card like a [callout](./callouts.md), with a matching colour and a default icon. The types are `note`, `info`, `tip`, `warning`, `danger`, and `check`.

```md
!!! cards { cols=2 }
    - **Tip**{ type=tip }
      A helpful suggestion.

    - **Danger**{ type=danger }
      A risky action.
```

!!! cards
    - !!! cards { cols=2 }
          - **Tip**{ type=tip }
            A helpful suggestion.

          - **Danger**{ type=danger }
            A risky action.

## Horizontal, image, and call-to-action

A few more options shape the card:

- `{ horizontal }` lays it out icon-left, text-right, compact.
- `{ img=<url> }` puts an image across the top.
- `{ cta="..." arrow }` adds a call-to-action line; the arrow shows by default on external links.

```md
!!! cards { cols=2 }
    - [Compact](./steps-and-accordion.md){ icon=list-checks horizontal }
      A horizontal card sits icon-left, text-right.

    - [Browse icons](https://lucide.dev){ icon=external-link cta="Open Lucide" }
      External links get an arrow automatically.
```

!!! cards
    - !!! cards { cols=2 }
          - [Compact](./steps-and-accordion.md){ icon=list-checks horizontal }
            A horizontal card sits icon-left, text-right.

          - [Browse icons](https://lucide.dev){ icon=external-link cta="Open Lucide" }
            External links get an arrow automatically.

## Columns and plain cards

`{ cols=1 }` through `{ cols=4 }` fix the column count. Omit `cols` for an auto-fit grid that flows to the available width (a value outside 1 to 4 falls back to that auto-fit). A card with no link and no options is just a plain card.

```md
!!! cards
    - **Fast** so readers stay.
    - **Yours** under AGPL, fork freely.
    - just plain text, no title
```

!!! cards
    - !!! cards { cols=3 }
          - **Fast** so readers stay.
          - **Yours** under AGPL, fork freely.
          - just plain text, no title

## Gotchas

- **Blank line between cards.** Separate list items with a blank line so each becomes its own card rather than merging.
- **Grid options on the opener, card options on the title.** `cols` goes on `!!! cards`; `icon`, `type`, `horizontal`, `img`, `cta`, and `arrow` go in the `{ ... }` right after a card's title.
- **Don't build a wall of cards.** A grid is for a handful of clear choices. Past six or eight, a reader is scanning, not choosing; group them or use a list.

## See also

- [Callouts](./callouts.md), the same colour vocabulary applied to a line of prose instead of a panel.
- [Content tabs](./tabs.md), for alternatives read in place rather than clicked through to.
