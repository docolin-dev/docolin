---
title: Soft links
description: A soft link points at a topic, not a single page. Following it lists the guides under that topic, with the best fit for the reader's setup ranked toward the top.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/concepts/soft-links
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases: [soft links, setup-aware links, kind links, one link many guides]

  prev: ./kinds.md
  next: ./verification.md
---

# Soft links

!!! info "In one line"
    A soft link points at a _topic_ instead of a single page. Follow it and you get the guides filed under that topic, ranked so the one that fits your setup sits near the top, for you to pick.

## Same question, many right answers

"How do I set up a firewall?" has no single correct page, as Pango finds out every time he tries to write one. An Ubuntu reader needs UFW; a Fedora reader needs firewalld. A normal link forces the author to pick one of them, and half the readers land on instructions that don't match their machine.

## Link to the topic, not the file

A soft link is just a link to a [kind](./kinds.md) path. No special syntax:

```markdown
See [setting up a firewall](/os/linux/firewall/setup).
```

Following it opens the kind's **browse page**: a list of every guide filed under that path. The list comes ranked, and if docolin has learned your setup, the guides that match it are nudged toward the top, so the likely-right one is easy to spot. You still pick. Same link, different order:

=== "Ubuntu reader"
    With `ubuntu` in the reader's setup, the UFW guide ranks first, but both are right there to choose from:

    !!! cards { cols=1 }
        - **Set up UFW**
          Applies to `ubuntu`
        - **Set up firewalld**
          Applies to `fedora`

=== "Fedora reader"
    With `fedora` in the setup, the same list, reordered:

    !!! cards { cols=1 }
        - **Set up firewalld**
          Applies to `fedora`
        - **Set up UFW**
          Applies to `ubuntu`

Neither reader had to know which tool their distro uses, or even that the other guide existed. The kind is the shared address; the ranking floats the likely-right guide to the top, and the reader chooses from there.

## Decided in your browser, not on a server

The page docolin sends is the same for everyone, so it stays fast and cacheable, and it arrives ranked by how well-verified and recent each guide is.

The reorder happens **after** it loads, in your browser. If docolin has picked up your setup from the guides you've read, it quietly nudges the matching ones higher. That profile lives only on your device, inferred from what you read rather than anything you fill in, so a brand-new reader, with nothing learned yet, just sees the best-verified guides first. More on it in [privacy by design](./privacy.md).

## When to reach for one

Use a soft link when there is more than one credible answer (different distros, versions, tools) and you want the fitting one to surface near the top for each reader, instead of forcing everyone onto a single page. For one specific page everyone should see, link it directly. The full syntax, and how docolin tells a soft link from a project link, is in [links and navigation](../authoring/links-and-navigation.md).
