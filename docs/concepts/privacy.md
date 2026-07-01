---
title: Privacy by design
description: docolin collects the minimum, defaults to anonymous, and keeps the one thing it personalizes, your setup, on your own device instead of on a server.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/concepts/privacy
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases: [privacy, setup profile, anonymous reading, no tracking, privacy by design]

  prev: ./attribution.md
---

# Privacy by design

!!! info "In one line"
    docolin is built to need as little about you as possible. You read anonymously, and the one thing it personalizes, your setup, is worked out and kept on your own device.

Pango curls up at the first sign of being watched, and docolin is built with the same instinct. Privacy here isn't a setting you switch on; it's the shape of the thing: the design collects the minimum, defaults to anonymous, and keeps personalization on your machine instead of on a server.

## Read without an account

You never need to sign in to read. And the page docolin serves for a given guide is identical for every reader, so it can be cached at the edge and carries no identity with it. There is nothing to log you into, and nothing personal baked into what comes back.

## Your setup stays on your device

So how does docolin know to show an Ubuntu reader the UFW guide and a Fedora reader the firewalld one (the trick behind [soft links](./soft-links.md))?

It watches which guides you actually spend time reading and infers your likely setup (tags like `ubuntu`, `wayland`, `postgres`) from them. That profile lives only in your browser's local storage. It is never synced to an account, and it is not a fingerprint. When you search, a tiny capped slice of those tags rides along as a ranking hint, and that is the only moment any of it leaves your browser.

The result is personalization that can't follow you around, because it never leaves you in the first place.

## What it never does

No fingerprinting. No third-party trackers. No selling your data. The full account of what docolin collects (the minimum) and what it refuses to do is in the [privacy policy](../privacy.md).
