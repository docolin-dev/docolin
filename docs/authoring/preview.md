---
title: Preview on save
description: Open a local docs folder and see your docos rendered exactly as they'll publish, live as you save, before you commit anything.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/preview
  type: how-to

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases: [preview, local preview, render on save, before you publish, edit locally]

  prev: ./quickstart.md
  next: ./frontmatter.md
---

# Preview on save

!!! info "In one line"
    Open a local docs folder and see your docos rendered exactly as they'll publish, before you commit a thing.

Pango likes to see where he's putting his feet before he commits to a bar, and writing is the same. docolin renders Markdown with its own [extensions](./overview.md): callouts, tabs, charts, diagrams, and more, and a raw `.md` file doesn't tell you how any of that will actually look. The preview closes the gap by running docolin's real renderer right in your browser.

## Live, on Chromium

On a Chromium browser (Chrome, Edge, Brave, Arc), open [the preview](/preview) and pick your docs folder. Then just write: edit a file in your own editor, save, switch back to the preview tab, and your changes are already there. No pushing, no waiting, no guessing, it's the tightest loop docolin offers for writing.

??? "Using Brave?"
    Brave ships with the folder API turned off. If the picker doesn't open, enable it in Brave's settings, or use the upload option instead.

## Snapshot, everywhere else

Firefox and Safari can't open a live folder, so they take a one-time upload: choose your folder and the preview renders that snapshot. To see later edits, upload again. (Either way, the preview is desktop-only.)

## It stays on your machine

Your files are read and rendered locally, in your browser. Nothing is uploaded to docolin, and the doco doesn't need to be published, or even pushed, for the preview to render it. It's your working copy, shown exactly the way docolin would show it.

When it looks right, [host it from your repo](../hosting/overview.md) and it goes live for real.
