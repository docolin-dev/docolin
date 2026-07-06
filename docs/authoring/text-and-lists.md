---
title: Text, lists, and links
description: The everyday Markdown, headings, emphasis, lists, file trees, quotes, links, images, video, color swatches, and inline icons, that the rest of a doco hangs from.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/text
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 8m

  status: stable

  aliases:
    [
      markdown basics,
      headings,
      lists,
      emphasis,
      links,
      images,
      inline icons,
      color swatches,
      click to copy,
      video,
      youtube,
      file tree,
      directory structure,
    ]

  prev: ./frontmatter.md
  next: ./tables.md
---

# Text, lists, and links

!!! info "In one line"
    The everyday Markdown, headings, emphasis, lists, file trees, quotes, links, images, video, color swatches, and inline icons, that the rest of a doco hangs from.

Most of any doco is just words. Pango can climb all the fancy apparatus he likes, but the guide still rests on plain paragraphs, a few lists, and the odd link. docolin speaks standard [CommonMark](https://commonmark.org) with [GitHub-Flavored Markdown](https://github.github.com/gfm/) on top, so if you have written a README, you already know most of this.

## Paragraphs and line breaks

A paragraph is one or more lines of text. A blank line starts a new one.

```md
Two lines of chatter,
which stay one paragraph.

A blank line above makes this a new paragraph.
```

!!! output "Rendered"
    Two lines of chatter,
    which stay one paragraph.

    A blank line above makes this a new paragraph.

Single line breaks are **joined**, not preserved, so you can hard-wrap your source however you like and the reader still sees flowing prose. (Pango talks a lot; this keeps his source files tidy.)

## Headings

One `#` per level, from `#` (the page title) down to `######`.

```md
# Page title
## A section
### A subsection
#### A smaller heading
```

There is no live preview here on purpose: rendering example headings would add them to this page's own contents list. Every heading gets an automatic id slugified from its text, so `## Climbing the bars` is linkable as `#climbing-the-bars`. The `##` and `###` headings also build the table of contents shown beside the page; `#` is the title and `####` and below are too granular to list.

## Emphasis

```md
A word can be **bold**, _italic_, or ~~strikethrough~~.
```

!!! output "Rendered"
    A word can be **bold**, _italic_, or ~~strikethrough~~.

## Inline code

Wrap code in backticks to set it apart from prose: `` `const grip = "firm"` `` renders as `const grip = "firm"`. For whole blocks, see [Code blocks](./code-blocks.md).

### Color swatches

Write a CSS color as inline code and it shows a live swatch the reader can click to copy the value. Hex, `rgb()`/`rgba()`, `hsl()`, and `oklch()` all work; anything that isn't a color stays plain inline code.

```md
Pango's scales are `#4a5568` and the gym mat is `rgb(118 185 0)`.
```

!!! output "Rendered"
    Pango's scales are `#4a5568` and the gym mat is `rgb(118 185 0)`.

### Click to copy

Any inline code can be made copyable with the `{ .copy }` marker, handy for a flag or token the reader will paste somewhere:

```md
Check the gym with `pango --status`{ .copy }.
```

!!! output "Rendered"
    Check the gym with `pango --status`{ .copy }.

A click puts the text on the clipboard and confirms with a toast. Use it for things a reader actually pastes; a copyable `variable` mid-sentence is just a trap for stray clicks.

## Lists

Unordered lists use `-`; ordered lists use `1.`. Indent to nest.

```md
1. Sniff the first bar
2. Climb it anyway
   1. Lose grip
   2. Curl into a ball
3. Bounce to the next bar
```

!!! output "Rendered"
    1. Sniff the first bar
    2. Climb it anyway
       1. Lose grip
       2. Curl into a ball
    3. Bounce to the next bar

```md
- Top bar
- Middle bar with a **firm grip**
  - Side rung
    - The bit only his tail can reach
- Bottom bar
```

!!! output "Rendered"
    - Top bar
    - Middle bar with a **firm grip**
      - Side rung
        - The bit only his tail can reach
    - Bottom bar

### Task lists

Prefix items with `[ ]` or `[x]` for a checklist. They render as styled checkboxes with the bullet removed.

```md
- [x] Find the gym
- [x] Eat 1,000 ants (pre-workout)
- [ ] Reach the top without rolling off
```

!!! output "Rendered"
    - [x] Find the gym
    - [x] Eat 1,000 ants (pre-workout)
    - [ ] Reach the top without rolling off

### File trees

Add `{ .tree }` on its own line after a nested unordered list (blank line before it, same as charts) and it renders as a file tree: a bordered card with folder and file icons, guide lines, and monospace names. Underneath it stays a real list, so screen readers and AIs read plain structure.

The rules are the ones your fingers already know:

- An item with nested children is a **folder**; a name ending in `/` marks an empty one (the slash is dropped, the icon says it).
- A `#` starts a muted, shell-style **comment** on any entry.
- **Bold** highlights the entry your guide is talking about. Backticks around names are fine but unnecessary, the tree is already monospace.

```md
- src
  - lib
    - utils.ts # shared helpers
  - **main.ts** # start here
- assets/
- package.json

{ .tree }
```

!!! output "Rendered"
    - src
      - lib
        - utils.ts # shared helpers
      - **main.ts** # start here
    - assets/
    - package.json

    { .tree }

For a longer note than a comment fits, annotations compose: write `{ .tree .annotate }`, put `(1)` after an entry, and follow the tree with a numbered list, the same badge-and-popover idiom as [code annotations](./code-blocks.md).

Ordered lists are left alone: a numbered file tree is a contradiction, and the visible `{ .tree }` marker is your cue that something is off.

## Blockquotes

Start a line with `>`. Stack them for nested quotes.

```md
> Scales on, snout up, and never look down.
>
> > (He looked down. He rolled into a ball. He was fine.)
```

!!! output "Rendered"
    > Scales on, snout up, and never look down.
    >
    > > (He looked down. He rolled into a ball. He was fine.)

## Links

```md
Visit [the burrow](/docolin/docolin/authoring/overview), wave at a [friend off-site](https://example.com),
or open a bare URL: <https://docolin.com>.
```

!!! output "Rendered"
    Visit [the burrow](/docolin/docolin/authoring/overview), wave at a [friend off-site](https://example.com),
    or open a bare URL: <https://docolin.com>.

- **Internal links** (starting with `/` or a relative `./path`) navigate in place. Hover one and docolin shows a small preview of where it goes; see [Links & navigation](./links-and-navigation.md).
- **External links** open in a new tab with `rel="noopener noreferrer"` added for you.
- **Autolinks**, a bare URL wrapped in `<...>`, become clickable as-is.

## Images

```md
![Pango mid-somersault off the high bar](https://placehold.co/720x240/png)
```

!!! output "Rendered"
    ![Pango mid-somersault off the high bar](https://placehold.co/720x240/png)

The text in brackets is the alt text. Write it as if describing the image to someone who cannot see it; it is what screen readers announce and what shows if the image fails to load. Never leave it empty for a meaningful image.

### Light and dark variants

A screenshot or diagram that reads well in one theme can be unreadable in the other. Tag a pair of images with `{ .light-only }` and `{ .dark-only }` and docolin shows whichever fits the reader's active theme:

```md
![Architecture diagram](architecture-light.png){ .light-only }
![Architecture diagram](architecture-dark.png){ .dark-only }
```

Each tag hides its image in the other theme, so only the matching one shows. Use the same alt text on both. If you only have one image, leave the tags off and it shows in both themes. (No preview here, it would need a real light/dark image pair to show anything.)

## Video and YouTube

The same image syntax embeds moving pictures; there is nothing new to learn. Point it at a video file (`.mp4`, `.webm`, `.mov`, ...) and it renders as a real player:

```md
![Big Buck Bunny](https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4)
```

!!! output "Rendered"
    ![Big Buck Bunny](https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4)

Point it at a YouTube URL and the video embeds the private way: only the thumbnail loads with the page, and no player, cookies, or tracking reach the reader until they press play (the embed then uses YouTube's no-cookie domain).

```md
![Big Buck Bunny, the short film](https://www.youtube.com/watch?v=aqz-KE-bpKQ)
```

!!! output "Rendered"
    ![Big Buck Bunny, the short film](https://www.youtube.com/watch?v=aqz-KE-bpKQ)

Only the image form embeds. A plain [YouTube link](https://youtu.be/aqz-KE-bpKQ) written as a link stays a link, so you can reference a video without planting a player mid-page.

## Horizontal rule

Three or more dashes on their own line draw a divider. Use it to separate genuinely distinct sections, not for decoration.

```md
Lights above the rule.

---

Lights below the rule.
```

!!! output "Rendered"
    Lights above the rule.

    ---

    Lights below the rule.

## Inline icons

Drop any [Lucide](https://lucide.dev/icons) icon into a line with `:name:` (kebab names work too).

```md
Climb :mountain: to the top, fuel up on :drumstick:, then read the :book-open:.
```

!!! output "Rendered"
    Climb :mountain: to the top, fuel up on :drumstick:, then read the :book-open:.

A bare name looks in Lucide first, then falls back to Font Awesome's free packs (so brand glyphs like `:github:` work too). The inline shortcode only accepts bare names; to force a specific set on a card icon, see [Cards](./cards.md#multi-set-icons).

docolin is careful about false positives: a stray colon or a time like `3:30` is left alone, and a `:rocket:` written inside `code` stays literal. The icons are rendered into the page on the server, so readers never download an icon library to see them.

## Gotchas

- **Blank lines matter.** A list or blockquote needs a blank line before it to start cleanly; without one it can fold into the paragraph above.
- **Indent nested list items** under the parent's text, not just by one space, or the nesting may not take.
- **Alt text is not optional** for images that carry meaning. Decorative-only images are rare in docs; if it is worth showing, it is worth describing.

## See also

- [Tables](./tables.md), the one piece of everyday structure with its own page (and a trick: it can become a chart).
- [Code blocks](./code-blocks.md) for fenced, highlighted code.
- [Footnotes & annotations](./footnotes-and-annotations.md) for `[^1]` references and inline notes.
