---
title: Cards
description: A list inside !!! cards renders as a responsive grid. Cards take icons, types, images, and links via { ... } options.
---

A card leads with a title (`[Link](url)` makes the whole card clickable, `**Bold**`
makes a static one), then a `{ ... }` of options, then the description. Group
options like columns go on the opener.

## Icons + links

`{ icon=name }` takes any [Lucide](https://lucide.dev/icons) icon. The whole card
is one hit area; hover it.

!!! cards { cols=2 }
    - [Get started](/pangos/jungle-gym/welcome){ icon=rocket }
      Set up in five minutes with the quickstart.

    - [Code bars](/pangos/jungle-gym/code){ icon=code }
      Every language shiki can highlight.

    - [Tabs](/pangos/jungle-gym/tabs){ icon=panels-top-left }
      Group alternatives behind labels.

    - [Accordion](/pangos/jungle-gym/accordion){ icon=chevrons-down-up }
      Collapse the long stuff.

## Typed cards

`{ type=... }` themes a card like a callout (`note`, `info`, `tip`, `warning`,
`danger`, `check`), with a matching color and default icon.

!!! cards { cols=2 }
    - **Note**{ type=note }
      Supporting information.

    - **Warning**{ type=warning }
      A potential issue.

    - **Tip**{ type=tip }
      A helpful suggestion.

    - **Danger**{ type=danger }
      A risky action.

## Horizontal, image, and CTA

`{ horizontal }` is a compact icon-left layout; `{ img=url }` puts an image on top;
`{ cta="..." arrow }` adds a call to action (the arrow shows by default for
external links).

!!! cards { cols=2 }
    - [Compact](/pangos/jungle-gym/steps){ icon=list-checks horizontal }
      A horizontal card sits icon-left, text-right.

    - [External](https://lucide.dev){ icon=external-link cta="Browse icons" }
      External links get an arrow automatically.

!!! cards { cols=2 }
    - [With an image](/pangos/jungle-gym/welcome){ img=<https://placehold.co/600x280> }
      An image-topped card.

    - [Custom CTA](/pangos/jungle-gym/code){ icon=book-open cta="Read the docs" arrow }
      A custom action label with an arrow.

## Plain + auto-fit

No link, no options: a plain card. Omit `cols` for an auto-fit grid.

!!! cards
    - **Fast** so readers stay.
    - **Typed** mdast all the way down.
    - **Yours** under AGPL, fork freely.
    - just plain text, no title
