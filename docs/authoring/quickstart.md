---
title: Your first doco
description: Write a complete docolin doco from an empty file to a publishable page, one piece at a time.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/quickstart
  type: tutorial

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 10m

  status: stable

  aliases: [first doco, getting started, hello world]

  prev: ./overview.md
  next: ./preview.md
---

# Your first doco

!!! info "In one line"
    Build a complete doco from an empty file to a publishable page, one piece at a time.

The fastest way to understand a doco is to write one. So Pango is going to write his very first guide, _How to dismount the high bar_, and you are going to follow along. We will start with an empty file and add one piece at a time until it is a real, publishable page.

## 1. Make a file

A doco is just a Markdown file in your project's repository. The file's location becomes its URL, so put it where it belongs:

```
docs/dismount-the-high-bar.md
```

That is the whole "setup." No build step, no special editor. If you can write a text file, you can write a doco.

## 2. Add the frontmatter

Every doco opens with a small block of [YAML frontmatter](./frontmatter.md) between two `---` fences. It tells docolin what the page is, who wrote it, and where it lives in the platform. Five fields are required:

```yaml
---
title: How to dismount the high bar
authors:
  - name: Pango

docolin:
  schema_version: 1
  kind: blog/pango/dismount-the-high-bar
  type: how-to
---
```

In plain terms:

- **`title`** is the headline, shown in tabs and search.
- **`authors`** is who gets the credit. `name` is for anyone; contributors with a docolin account use `handle` instead.
- **`schema_version`** is always `1` today.
- **`kind`** is the canonical path of the guide in docolin's taxonomy. Pango is writing a personal post, so he uses the `blog/{handle}/{slug}` shape.
- **`type`** is one of four intents (`tutorial`, `how-to`, `reference`, `explanation`). A guide that solves a specific task is a `how-to`.

!!! tip "Add a description while you are here"
    It is optional but worth it: a one-sentence `description:` becomes your search snippet and the summary an AI shows when it cites you. Two jobs from one line.

The [frontmatter reference](./frontmatter.md) covers every field. For now, those five are enough to publish.

## 3. Write the body

Below the closing `---`, you write Markdown. Start with the obvious: a heading and a paragraph.

```md
# How to dismount the high bar

Every climb ends one of two ways: a clean landing, or a somersault. This
guide is about the first one.
```

Add a list of what the reader needs:

```md
## Before you climb

- Chalk on both front claws
- A clear patch of sand below
- At least one escape roll practised
```

Then the part that actually matters. A plain warning would get skimmed, so reach for a [callout](./callouts.md) that won't:

```md
!!! warning "Never dismount head-first"
    A head-first drop triggers the curl reflex mid-air. You will land as a
    ball, bounce twice, and lose all your style points.
```

!!! output "Rendered"
    !!! warning "Never dismount head-first"
        A head-first drop triggers the curl reflex mid-air. You will land as a ball, bounce twice, and lose all your style points.

And when there is an exact command to run, a [code block](./code-blocks.md) keeps it copyable and highlighted:

````md
```bash
# the only safe descent Pango trusts
pango dismount --roll-on-contact
```
````

!!! output "Rendered"
    ```bash
    # the only safe descent Pango trusts
    pango dismount --roll-on-contact
    ```

That is a complete, useful page. Everything past this point is polish.

## 4. Publish it

docolin syncs from your git repository, so publishing is really just committing and pushing. There is no separate deploy: once your project is connected, docolin reads the new file straight from the repo, checks the frontmatter, and serves the page at its hard URL.

A plain push does not trigger the sync, though. By default docolin polls your repo on its own schedule, so a new commit is usually picked up within a day. To skip the wait, open your project's page in the docolin dashboard and hit **Refresh** to pull the latest commit right now, or set up [auto-sync on push](../hosting/auto-sync-on-push.md) so every push syncs the moment it lands.

The full mechanics of hard URLs and pinned versions live in [Links & navigation](./links-and-navigation.md).

## The whole thing

Put together, Pango's first doco is this, start to finish:

````md
---
title: How to dismount the high bar
description: Land a high-bar dismount cleanly instead of rolling into an involuntary ball.
authors:
  - name: Pango

docolin:
  schema_version: 1
  kind: blog/pango/dismount-the-high-bar
  type: how-to
---

# How to dismount the high bar

Every climb ends one of two ways: a clean landing, or a somersault. This
guide is about the first one.

## Before you climb

- Chalk on both front claws
- A clear patch of sand below
- At least one escape roll practised

!!! warning "Never dismount head-first"
    A head-first drop triggers the curl reflex mid-air. You will land as a
    ball, bounce twice, and lose all your style points.

```bash
# the only safe descent Pango trusts
pango dismount --roll-on-contact
```
````

## Where to go next

You now know the shape of a doco. The rest of this guide fills in the toolbox, one construct at a time. The natural next stop is the [frontmatter reference](./frontmatter.md), so every field in that block stops being a mystery. Or jump straight to whatever you came for in the sidebar.
