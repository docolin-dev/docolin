---
title: Footnotes & annotations
description: Footnote references collected at the bottom of the page, and inline annotations that pin a note to an exact spot.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/footnotes-annotations
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: intermediate
  time_estimate: 7m

  status: draft

  aliases: [footnotes, citations, annotations, inline notes, references]

  prev: ./math.md
  next: ./links-and-navigation.md
---

# Footnotes & annotations

Pango's boasts come with receipts, and the receipts shouldn't clutter the main line. Two tools keep the page clean: **footnotes**, gathered at the bottom for sources and asides, and **annotations**, pinned to an exact spot for "what is this, right here." They look similar but solve different problems.

## Footnotes

A footnote reference is `[^label]` in the text. Define it with `[^label]:` somewhere in the file; the definition can sit anywhere, and all of them render in a Footnotes section at the bottom.

```md
Pango's boasts come with receipts.[^scales] He keeps a running tally too.[^ants]

[^scales]: Pangolins are the only mammals entirely covered in scales.
[^ants]: Up to 70 million ants and termites a year, per pangolin.
```

Pango's boasts come with receipts.[^scales] He keeps a running tally too.[^ants]

[^scales]: Pangolins are the only mammals entirely covered in scales.

[^ants]: Up to 70 million ants and termites a year, per pangolin.

The label is just a handle for you; readers see numbers, assigned in order of first appearance. Hover a marker for a preview of the note without leaving your place; the bottom section is the path for printing, no-JS, and permalinks.

Footnotes are flexible: the same marker can be reused, and a footnote can even reference another.

```md
The same marker can be reused,[^scales] and one note can cite another.[^chain]

[^chain]: Which points onward to the scales note.[^scales]
```

## Annotations

An annotation pins a note to a precise point. Mark the spot with `(n)` and follow the block with a numbered list; the marker becomes a small badge that opens its note on click. This shines on [code blocks](./code-blocks.md), where it explains a line without crowding it:

````md
```bash
sudo dnf install akmod-nvidia  # (1)!
```

1. Pulls the driver as an akmod, so it rebuilds for each new kernel.
````

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
