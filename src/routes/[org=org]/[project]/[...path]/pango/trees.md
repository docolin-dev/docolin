---
title: File trees
description: Nested lists promoted to file trees with { .tree }.
---

# File trees

A nested unordered list followed by `{ .tree }` renders as a file tree. The list stays a real list underneath, so screen readers, search engines, and AIs read it as plain structure. No backticks needed, the whole tree is monospace (backticked names render identically).

## Basic

- src
  - lib
    - utils.ts
    - resolve-link.ts
  - routes
    - +page.svelte
  - main.ts
- static
  - favicon.ico
- package.json
- README.md

{ .tree }

## Comments

A `#` starts a muted, shell-style comment on any entry:

- messages # one file per locale, keys must match
  - en.json # the base locale
  - de.json
  - fr.json
- svelte.config.js # runes are forced on here

{ .tree }

## Empty folders and highlights

A name ending in `/` marks an empty folder (the slash is dropped, the folder icon says it). Bold marks the entry a guide is talking about:

- src
  - lib/
  - assets/
  - **routes** # everything below here is yours
    - **+page.svelte** # start in this file
- package.json

{ .tree }

## Deep nesting

- a
  - b
    - c
      - d
        - deep.txt # five levels down

{ .tree }

## Inside an admonition

!!! note "Where things live"
    - docs
      - authoring
        - charts.md
        - text-and-lists.md
      - hosting
        - connect-repo.md

    { .tree }

## Annotations

Add `.annotate` to the marker and `(N)` badges work like in code blocks, with the numbered list after the tree as the popover content:

- src
  - main.ts (1)
  - lib
    - resolve-link.ts (2)
- package.json

{ .tree .annotate }

1. The entry point, this is where the app boots.
2. Soft links and doco-slot resolution both live here.

## What it is not

A plain list without the marker stays a plain list:

- just
- a
- list

An ordered list is never promoted (the visible marker below is the cue):

1. src
2. main.ts

{ .tree }
