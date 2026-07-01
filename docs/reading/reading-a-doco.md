---
title: Reading a doco
description: "A doco shows more than the steps, it shows how far to trust them: the Pango score, the systems it applies to, its full version history, and where to raise a fix."
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/reading/reading-a-doco
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases: [reading a doco, the viewer, verification rail, versions, applies to, edit]
---

# Reading a doco

!!! info "In one line"
    A doco shows you more than the steps: the Pango score and the confirmations behind it, the systems it's written for, and its full history, so you can judge how far to trust it before you follow it.

## The verification rail

Alongside the guide sits its [Pango score](../concepts/verification.md): the number, how many confirmations stand behind it, and when it was last confirmed, Pango's running tally on whether it still holds up. On a narrow screen the rail moves to the end of the article, right next to where you stamp your own outcome.

## Is it for your system?

A guide lists the setups it applies to. If yours is among them and the score is high, you're on solid ground. If it isn't, treat the guide as unproven for you: a great guide for Ubuntu says nothing about your Fedora box. This is the same signal [soft links](../concepts/soft-links.md) use to rank the guides under a topic in the first place.

## Every version is kept

docolin keeps a doco's full history. You can look back at earlier versions, and each one carries its own [verification](../concepts/verification.md), so a recent rewrite never borrows the old version's proof. (Why a new version each time is in [how sync works](../hosting/how-sync-works.md).)

## Built to read

Every rich block an author can use renders here: copyable code, shareable links to a single line, content tabs, callouts, diagrams, and the rest of the [authoring](../authoring/overview.md) toolkit. With JavaScript off you still get the full content; the extras just stay static.

## Found a problem?

Two doors. Open a [discussion](./discussions.md) on the doco to raise a question or flag a fix, or follow the **edit** link to the source file on its forge and propose a change the normal git way.
