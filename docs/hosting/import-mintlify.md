---
title: Import a Mintlify project
description: Already on Mintlify? Add docolin frontmatter to each page and connect the repo. docolin reads your .mdx directly and converts the components, no rewrite.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/hosting/import-mintlify
  type: how-to

  applies_to:
    - docolin

  language: en
  difficulty: intermediate
  time_estimate: 5m

  status: stable

  aliases:
    - mintlify
    - mdx
    - import mintlify
    - migrate from mintlify
    - docs.json
    - mint.json
---

# Import a Mintlify project

docolin docs are written in [docomd](../authoring/overview.md), plain Markdown with a few extensions, in `.md` files. But if your docs already live in a [Mintlify](https://mintlify.com) project, you don't have to rewrite them. Point docolin at the repo, add a little frontmatter to each page, and docolin reads your existing `.mdx` files, converting Mintlify's components to their docolin equivalents as it syncs.

!!! info "In one line"
    Already on Mintlify? Add docolin frontmatter to each page and connect the repo. docolin imports your `.mdx` directly, no rewrite.

## How docolin spots a Mintlify project

docolin looks for a Mintlify config, `docs.json` (or the older `mint.json`), at your docs root. When it finds one, two things change for that project:

- **`.mdx` files become docos.** In an ordinary docolin repo only `.md` files are read, and a stray `.mdx` is left alone. In a Mintlify project, `.mdx` is read too.
- **Your sidebar comes from the Mintlify navigation.** docolin builds the sidebar from the `navigation` in your `docs.json`, so you don't write [`doco_sitemap.yaml`](../authoring/links-and-navigation.md) files. Keep curating the nav in Mintlify the way you always have.

Connecting the repo is otherwise the same [connect a repo](./connect-repo.md) flow.

## What you add to each page

A Mintlify page carries a `title` and `description` in its frontmatter, and docolin keeps both exactly as you wrote them. What it needs you to add is the part that makes a page a doco: an `authors` list and a `docolin` block with a `kind` and a `type`.

```md
---
title: Quickstart
description: Get up and running in five minutes.
authors:
  - handle: your-handle
docolin:
  schema_version: 1
  kind: your-product/getting-started/quickstart
  type: how-to
---

Your existing MDX body, unchanged.
```

docolin never invents these fields for you. The `kind` is how the page is filed in the [taxonomy](../concepts/kinds.md), and the author is who gets [credited](../concepts/attribution.md), so both are yours to set. A page missing them is skipped with a clear note listing what to add, exactly like any other [file that won't publish](./how-sync-works.md). Nothing silently vanishes.

## What converts, and what doesn't

docolin rewrites Mintlify's components into docomd as it imports:

| Mintlify component                                  | Becomes                                      |
| --------------------------------------------------- | -------------------------------------------- |
| `<Note>`, `<Info>`, `<Tip>`, `<Warning>`, `<Check>` | [Callouts](../authoring/callouts.md)         |
| `<Steps>`                                           | [Steps](../authoring/steps-and-accordion.md) |
| `<CardGroup>`, `<Columns>`, `<Card>`                | [Cards](../authoring/cards.md)               |
| `<Accordion>`, `<AccordionGroup>`, `<Expandable>`   | [Collapsibles](../authoring/callouts.md)     |
| `<Tabs>`, `<Tab>`                                   | [Content tabs](../authoring/tabs.md)         |
| `<CodeGroup>`                                       | A grouped code block                         |
| `<Frame>`, images                                   | Images                                       |

Card icons keep their look: docolin reads `icons.library` from your `docs.json` (Font Awesome, Lucide, or Tabler) and tags each icon to the right set.

Anything docolin has no equivalent for, a `<Tooltip>`, a `<Badge>`, a custom component, is **unwrapped**: the wrapper is dropped and the Markdown inside it is kept, so no prose is ever lost. MDX-only machinery, `import` and `export` lines, `{expressions}`, and `{/* comments */}`, is dropped.

!!! note "docolin's native format is docomd"
    Importing is for docs that already exist in Mintlify. When you write something new, write it in [docomd](../authoring/overview.md): plain Markdown, no build step, and it previews [as you save](../authoring/preview.md).
