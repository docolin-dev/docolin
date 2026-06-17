---
title: What docolin is
description: docolin is an open documentation commons where every guide is verified on real systems, credited to its author, and read by people and AI from the same source.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/concepts/overview
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases: [what is docolin, about docolin, docolin overview, intro to docolin]

  next: ./kinds.md
---

# What docolin is

!!! info "In one line"
    docolin is an open, community-built documentation commons where every guide is verified on real systems, credited to its author, and read by both people and AI from the same source.

Pango, docolin's pangolin, has read his share of technical docs, and most of them let him down: abandoned half-finished, gone stale, or impossible to trust because nothing said whether the steps still worked. docolin is the opposite by design. It is documentation you reach for instead of endure, kept current by the people who actually use it, and proven on real machines before you bet your afternoon on it.

It is open from the ground up: [AGPL-licensed](../licensing.md) and public, so the same platform and the same content are there for everyone, and no one can buy it and close it off.

## What makes it different

Each idea below has its own page. Start anywhere.

!!! cards { cols=2 }
    - [Kinds and the path taxonomy](./kinds.md){ icon=folder-tree }
      Topics are paths, like `os/linux/firewall`, so related guides nest and the right one is easy to find.

    - [Soft links](./soft-links.md){ icon=link }
      One link to a topic lists the guides under it, ranked so the fit for _your_ setup is near the top: UFW for an Ubuntu reader, firewalld for a Fedora one.

    - [Verification and the Pango score](./verification.md){ icon=badge-check }
      Real users stamp whether a guide actually worked for them. The Pango score shows how well it has held up.

    - [Attribution](./attribution.md){ icon=at-sign }
      Every doco credits its author, and every answer an AI builds from it carries that credit.

    - [Privacy by design](./privacy.md){ icon=lock }
      Anonymous by default, no tracking. What docolin learns about your setup stays on your device.

## Who it's for

The same commons serves three readers at once:

- **People** looking for an answer they can trust. [Start reading](../reading/overview.md).
- **Writers and projects** who want their docs read and kept honest. [Host yours](../hosting/overview.md).
- **AI agents** that ground their answers in verified sources instead of stale memory. [Connect over MCP](../mcp/connect.md).

You do not need an account to read, and you never need one to be read fairly: verification, attribution, and the same content are there for everyone.
