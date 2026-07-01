---
title: Attribution
description: Every doco names its author, and that credit follows the work everywhere docolin is read, on the page for a human and in the citation an AI is required to give.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/concepts/attribution
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases: [attribution, authors, credit, citation, byline]

  prev: ./verification.md
  next: ./privacy.md
---

# Attribution

!!! info "In one line"
    Every doco names its author, and that credit travels with the work: on the page when a person reads it, and in the citation when an AI uses it.

A guide is only worth writing if writing it counts, which is why Pango puts his name on every one. On docolin, authorship is explicit and it follows the work everywhere it goes.

## You say who wrote it

Every doco lists its [author or authors](../authoring/frontmatter.md) in frontmatter, in one of two shapes:

- A **`handle`** for a docolin user. The byline links to their profile and their other work.
- A **`name`** (with an optional link) for someone external: a colleague, an upstream maintainer, anyone without a docolin account.

docolin never scrapes this from git history or guesses it from a commit. You name the author, so credit lands where it belongs even when the person who committed the file isn't the one who wrote the words.

## Credit that travels

The byline isn't decoration; it's a contract that holds wherever the guide is read:

- **A human** opens the guide and sees who stands behind it, one click from their profile.
- **An AI agent** that uses the guide [over MCP](../mcp/connect.md) is required to cite its title, author, and URL in any answer it informs. Every time, not just when convenient.

That second one is the part most platforms drop. When an assistant grounds an answer in a docolin guide, the author is named in the answer. The work doesn't dissolve into the model; the person who wrote it keeps the credit.

## The deal

This is what keeps the commons worth writing for: contribute something good, and you are credited every time it helps someone, whether a human reads it or a machine repeats it. [Verification](./verification.md) proves a guide works; attribution makes sure the person who made it work is never anonymous.
