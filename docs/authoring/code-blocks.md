---
title: Code blocks
description: Fenced, syntax-highlighted code with titles, line numbers, author highlights, reader-shareable line selection, and inline annotations.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/code
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 9m

  status: draft

  aliases: [code blocks, syntax highlighting, code fences, line highlighting, code annotations]

  prev: ./tables.md
  next: ./callouts.md
---

# Code blocks

Every good jungle gym ships with code, and docolin treats it as a first-class citizen: highlighted on the server, copyable in one click, and linkable down to the exact line. This page is about fenced blocks; for a backtick `span` inside a sentence, see [inline code](./text-and-lists.md#inline-code).

## A fenced block

Open and close with three backticks. Put the language right after the opening fence to get syntax highlighting.

````md
```python
def somersaults(height_m: float) -> int:
    return int(height_m // 0.5)
```
````

```python
def somersaults(height_m: float) -> int:
    return int(height_m // 0.5)
```

Highlighting covers every language [Shiki](https://shiki.style) ships with. An unknown language falls back to a plain block instead of erroring, and a fence with no language is left unhighlighted, handy for shell output or ASCII art.

```
   .--.
  ( o_o )   pango approves
   > ^ <
```

## Title, line numbers, and highlights

Three options go on the opening fence, after the language:

- `title="..."` adds a filename bar across the top.
- `linenums="1"` turns on always-visible line numbers, starting at the given number.
- `hl_lines="2"` highlights one or more lines you want to draw the eye to (`hl_lines="2 5-7"` works too).

````md
```ts title="feed-pango.ts" linenums="1" hl_lines="7"
interface Pangolin {
  name: string;
  scales: number;
  rolledUp: boolean;
}

export function feedPango(p: Pangolin, ants: number): Pangolin {
  return { ...p, rolledUp: ants > 5000 };
}
```
````

```ts title="feed-pango.ts" linenums="1" hl_lines="7"
interface Pangolin {
  name: string;
  scales: number;
  rolledUp: boolean;
}

export function feedPango(p: Pangolin, ants: number): Pangolin {
  return { ...p, rolledUp: ants > 5000 };
}
```

## Copy and shareable lines

Every block carries two controls in its top-right corner:

- **Copy** puts the block's contents on the clipboard.
- **Select** lets a _reader_ highlight lines: click the button, then click a line (shift-click for a range). The selection is written into the page URL, so the link they share reopens with those exact lines lit. It is the fastest way to say "look at line 7" without a screenshot.

## Showing a code block without running it

To document Markdown itself, you need a fence that contains a fence. Wrap the outer block in **four** backticks and the inner three-backtick fence stays literal:

`````md
````md
```ts
const grip = "firm";
```
````
`````

The rule is simply "more backticks on the outside than anywhere inside." Four wraps three; five wraps four. (This whole guide is written that way.)

## Annotations

Mark a line with `(n)` and follow the block with a numbered list. The marker becomes a small badge; clicking it opens the matching note. This keeps a block readable while still explaining it line by line.

Add a `!` (`(n)!`) to strip the comment that carried the marker, so only the badge remains. A real call like `listen(8080)` is left untouched.

````md
```bash
sudo dnf install rpmfusion-free-release  # (1)!
sudo dnf install akmod-nvidia            # (2)!
```

1. Enables the RPM Fusion repo, where the driver lives.
2. Pulls the driver as an akmod, so it rebuilds for each new kernel.
````

```bash
sudo dnf install rpmfusion-free-release  # (1)!
sudo dnf install akmod-nvidia            # (2)!
```

1. Enables the RPM Fusion repo, where the driver lives.
2. Pulls the driver as an akmod, so it rebuilds for each new kernel.

A note can hold rich Markdown of its own, including another code block. The same annotation mechanism works on non-code blocks too, with `{ .annotate }`; both are covered in [Footnotes & annotations](./footnotes-and-annotations.md).

## Gotchas

- **The language is just a hint.** A typo'd or unknown language degrades to a plain block; it never breaks the page, but you also lose highlighting, so check the spelling.
- **Annotation list right after the block.** The numbered list of notes must immediately follow its code block, in order, or the badges won't find their notes.
- **Don't over-highlight.** `hl_lines` loses its meaning if half the block is highlighted. Mark the one or two lines that matter.

## See also

- [Content tabs](./tabs.md), for offering the same command across npm, pnpm, yarn, and bun in synced tabs.
- [Footnotes & annotations](./footnotes-and-annotations.md), for annotating prose and other blocks the same way.
