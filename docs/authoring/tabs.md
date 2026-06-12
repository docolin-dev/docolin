---
title: Content tabs
description: Group alternatives behind a single set of labels, with code tabs that stay in sync across the whole page.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/tabs
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 6m

  status: draft

  aliases: [tabs, content tabs, tabbed code, synced tabs]

  prev: ./callouts.md
  next: ./cards.md
---

# Content tabs

Some things come in flavours. Pango installs ants one way on Linux and another on macOS, and a doco shouldn't make a Linux reader wade through the macOS steps to find theirs. Tabs put the alternatives behind one set of labels and let the reader pick.

## Basic tabs

Write consecutive `=== "Label"` blocks, each with a four-space-indented body. Adjacent ones merge into a single tabbed set.

```md
=== "Linux"
    Pango installs ants via the system package manager.

=== "macOS"
    Pango prefers a fresh jar of ants from Homebrew.

=== "Windows"
    Pango tolerates ants from the Microsoft Store, grudgingly.
```

=== "Linux"
    Pango installs ants via the system package manager.

=== "macOS"
    Pango prefers a fresh jar of ants from Homebrew.

=== "Windows"
    Pango tolerates ants from the Microsoft Store, grudgingly.

## Synced code tabs

This is the one you will reach for most. When two tab sets share the same labels, picking a tab in one switches the other to match, and the choice is remembered across pages and visits. Show every install command once, and a `pnpm` reader sees `pnpm` everywhere.

Because each panel is a full [code block](./code-blocks.md), the title bar, copy button, and line selection all keep working inside a tab.

````md
=== "npm"
    ```bash
    npm install pangolin
    ```

=== "pnpm"
    ```bash
    pnpm add pangolin
    ```

=== "bun"
    ```bash
    bun add pangolin
    ```
````

=== "npm"
    ```bash
    npm install pangolin
    ```

=== "pnpm"
    ```bash
    pnpm add pangolin
    ```

=== "bun"
    ```bash
    bun add pangolin
    ```

## Rich panels

A panel holds any Markdown, callouts, tables, lists, even other tabs.

```md
=== "Overview"
    Pangolins are the only mammals **wholly covered in scales**.

=== "Care"
    !!! warning "Handle gently"
        A frightened pango rolls into a ball. Do not unroll it by force.
```

=== "Overview"
    Pangolins are the only mammals **wholly covered in scales**.

=== "Care"
    !!! warning "Handle gently"
        A frightened pango rolls into a ball. Do not unroll it by force.

## Labels can be anything

Emojis, symbols, long phrases, all fine. Long labels wrap rather than overflow the bar, and a single `=== ` block is still a (one-tab) set, no special-casing.

## Gotchas

- **Four-space indent**, same as callouts. The body must sit four spaces under the `=== "Label"` line.
- **Labels are the sync key.** Two sets sync only when their labels match exactly, so keep `npm`/`pnpm`/`bun` spelled and cased the same everywhere you want them linked.
- **Anything non-tab splits the set.** A paragraph or callout between two `===` runs ends the first set and starts a fresh one. That is the feature, not a bug: it is how you place two independent tab groups on one page.

## See also

- [Code blocks](./code-blocks.md) for the panels inside synced code tabs.
- [Cards](./cards.md), for when the alternatives are destinations to click rather than content to read in place.
