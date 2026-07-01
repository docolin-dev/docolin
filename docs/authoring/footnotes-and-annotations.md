---
title: Footnotes & annotations
description: Footnote references collected at the bottom of the page, and inline annotations that pin a note to an exact spot.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/footnotes-annotations
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: intermediate
  time_estimate: 7m

  status: stable

  aliases: [footnotes, citations, annotations, inline notes, references]

  prev: ./math.md
  next: ./links-and-navigation.md
---

# Footnotes & annotations

!!! info "In one line"
    Footnotes gathered at the bottom for sources and asides, and inline annotations that pin a note to an exact spot.

Pango's boasts come with receipts, and the receipts shouldn't clutter the main line. Two tools keep the page clean: **footnotes**, gathered at the bottom for sources and asides, and **annotations**, pinned to an exact spot for "what is this, right here." They look similar but solve different problems.

## Footnotes

A footnote reference is `[^label]` in the text. Define it with `[^label]:` somewhere in the file; the definition can sit anywhere, and all of them render in a Footnotes section at the bottom.

```md
Pango's boasts come with receipts.[^scales] He keeps a running tally too.[^ants]

[^scales]: Pangolins are the only mammals entirely covered in scales.
[^ants]: Up to 70 million ants and termites a year, per pangolin.
```

A footnote won't sit in a preview card: the marker is inline, and the note itself lands in this page's Footnotes section at the very bottom, not beside the text. So here is a live one.[^scales] And a second, for the tally.[^ants] Each marker renders as a number, assigned in order of first appearance; hover one for a peek without leaving your place, or scroll to the foot of the page for the full note. That bottom section is also the path for printing, no-JS, and permalinks.

[^scales]: Pangolins are the only mammals entirely covered in scales.

[^ants]: Up to 70 million ants and termites a year, per pangolin.

Footnotes are flexible: the same marker can be reused, and a footnote can even reference another.

```md
The same marker can be reused,[^scales] and one note can cite another.[^chain]

[^chain]: Which points onward to the scales note.[^scales]
```

Live, the scales note shows up again here,[^scales] while this one cites it in turn.[^chain]

[^chain]: Which points onward to the scales note.[^scales]

## Annotations

An annotation pins a note to a precise point. Mark the spot with `(n)` and follow the block with a numbered list; the marker becomes a small badge that opens its note on click. This shines on [code blocks](./code-blocks.md), where it explains a line without crowding it:

````md
```bash
sudo dnf install akmod-nvidia  # (1)!
```

1. Pulls the driver as an akmod, so it rebuilds for each new kernel.
````

!!! output "Rendered"
    ```bash
    sudo dnf install akmod-nvidia  # (1)!
    ```

    1. Pulls the driver as an akmod, so it rebuilds for each new kernel.

On a code block, the trailing `!` (`(n)!`) strips the comment that carried the marker, leaving just the badge.

### Annotations anywhere

Annotations are not only for code. Tag any block with `{ .annotate }` on the line right after it, drop `(n)` markers in, and list the notes below.

```md
Tag any block with a marker, here (1), and list the notes underneath.
{ .annotate }

1. A note holds rich Markdown: **bold**, `code`, even a nested annotation.
```

!!! output "Rendered"
    Tag any block with a marker, here (1), and list the notes underneath.
    { .annotate }

    1. A note holds rich Markdown: **bold**, `code`, even a nested annotation.

Notes can hold whole constructs and can nest, an annotation inside an annotation, as deep as you care to climb.

## Which to use

- **A source, a citation, or an aside that belongs at the bottom?** Footnote.
- **A "what is this exact thing" note tied to a line of code or a phrase?** Annotation.

If a reader would want it collected with the other references, footnote it. If it only makes sense next to the thing it describes, annotate it.

## Gotchas

- **The note list goes right after its block.** Both footnote definitions and annotation lists are matched by order and position; keep the numbered list immediately after the block it annotates.
- **`{ .annotate }` opts a non-code block in**, and it goes on the line directly after the block with no blank line between them. Code blocks need no opt-in.
- **Markers inside inline `code` stay literal** in an annotated block, so writing about a `(1)` in prose won't accidentally make a badge.

## See also

- [Code blocks](./code-blocks.md), where annotations are native and the `(n)!` form lives.
- [Links & navigation](./links-and-navigation.md), for linking out instead of footnoting.
