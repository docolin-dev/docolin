---
title: Writing well
description: How to choose the right structure and the lightest construct, write accessibly, and remember that every doco is public and read by both people and machines.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/writing-well
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: intermediate
  time_estimate: 10m

  status: stable

  aliases: [writing well, style, diataxis, accessibility, best practices, structure, clarity]

  prev: ./publishing.md
---

# Writing well

!!! info "In one line"
    Choosing the right structure and the lightest construct, writing accessibly, and remembering docos are public.

You now have every tool in the gym. The last thing Pango learned is the hardest: the tools are not the point. A doc stuffed with callouts, tabs, and charts can still be useless, and a doc that is nothing but clear paragraphs can be excellent. This page is about using the toolbox with judgement.

## Pick one Diátaxis mode per doco

docolin's [`type`](./frontmatter.md#type-required) field is one of four [Diátaxis](https://diataxis.fr) modes, and they are not interchangeable. Each serves a reader in a different state of mind:

- **Tutorial** teaches a beginner by doing. It holds their hand and never assumes.
- **How-to** helps someone with a goal complete a specific task. It assumes competence and gets to the point.
- **Reference** answers "what are the exact details?" It is dry, complete, and lookup-friendly.
- **Explanation** answers "why is it like this?" It gives context and discusses trade-offs.

The common mistake is mixing modes in one doco: a how-to that keeps stopping to explain theory, a reference that breaks into a tutorial. Pick the dominant intent and write to it. If a topic genuinely needs two modes, write two docos, each at its own [`kind`](./frontmatter.md#kind-required), and link them with [prev/next](./links-and-navigation.md#prev-and-next).

## Choose the lightest construct that works

Every construct in this guide earns its place only when it beats a plain paragraph. Before reaching for one, ask what it buys the reader:

- A **callout** for the one thing they must not miss, not for every third sentence.
- A **chart** when the shape of the numbers matters more than the numbers; otherwise a [table](./tables.md) is honest and smaller.
- **Tabs** for true alternatives (one per OS), not to hide content a reader needs all of.
- **Collapsibles** for genuinely optional detail; never fold away something everyone has to read.

When in doubt, leave it out. A page is easier to read for everything you remove that wasn't pulling its weight.

## Write for everyone

Good docs are legible to readers using a screen reader, a keyboard, or a phone in the sun. Most of it is free if you build the habit:

- **Describe images** in their [alt text](./text-and-lists.md#images) as if to someone who can't see them.
- **Keep headings in order.** Use `##` then `###` for real structure; don't skip a level to get a smaller font.
- **Write link text that stands alone.** "See the [firewall guide](./links-and-navigation.md)" beats "click [here](./links-and-navigation.md)"; a screen reader often reads links out of context.
- **Don't lean on colour alone.** docolin's callouts and typed cards already pair colour with an icon and a label, so the meaning survives for a colour-blind reader; keep that habit in your own prose.
- **Keep tables simple.** Wide, deeply structured tables are hard to navigate non-visually; split or restructure them.

## Remember it's public

Everything you publish to docolin is **public**, full stop. That holds even when the source repository is private: docolin renders the content for everyone, and a doco's HTML is cached at the edge, identical for every reader.

Two consequences for how you write:

- **Never put secrets or personal data in a doco.** API keys, tokens, connection strings, someone's private details, none of it belongs in published content. If something sensitive slips out, the [moderation policy](/docolin/docolin/moderation-policy) covers getting it scrubbed quickly, but the goal is for it never to land.
- **A doco reads the same for everyone.** There is no per-reader content inside the page itself; tailoring happens through [soft links](./links-and-navigation.md#soft-links-by-kind) that rank the guides under a topic by fit, letting the reader pick, not through hidden sections within one page.

## Help the machines that cite you

docolin feeds AI tools through MCP, and they cite what they ground on. You make your guide a better citation with the same things that make it good for humans: a precise [`description`](./frontmatter.md#description-strongly-encouraged), accurate [`references`](./frontmatter.md#references-optional), honest [`status`](./frontmatter.md#status-optional-defaults-to-stable), and clear headings. Write for the reader; the machine benefits for free.

## A short checklist

Before you publish, a quick pass:

- [ ] One Diátaxis mode, matching `type`.
- [ ] Required frontmatter present and `kind` correct.
- [ ] A specific, concrete `description`.
- [ ] Every construct earns its place.
- [ ] Alt text on images; headings in order; link text that stands alone.
- [ ] No secrets, no personal data.

## See also

- [Overview](./overview.md), to start the guide over with fresh eyes.
- [Frontmatter](./frontmatter.md) and [Links & navigation](./links-and-navigation.md), the reference pages behind the advice here.
