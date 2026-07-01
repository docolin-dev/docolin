---
title: Publishing and the doco lifecycle
description: There's no publish button, a valid doco goes live the moment it syncs. Its status tells readers how finished it is, every edit is a version, and deleting tombstones.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/publishing
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases: [publishing, lifecycle, status, draft, deprecated, versions, tombstone, going live]

  prev: ./links-and-navigation.md
  next: ./writing-well.md
---

# Publishing and the doco lifecycle

!!! info "In one line"
    There is no publish button. A valid doco goes live the moment it syncs, and its `status` tells readers how finished it is.

The [authoring guide](./overview.md) covers writing a doco. This is what happens to it afterward, from first sync to the day Pango retires it, no publish button in sight.

## Going live is automatic

You don't publish a doco; you push it. Once your project is [connected](../hosting/overview.md), any file with valid frontmatter goes live on the next [sync](../hosting/how-sync-works.md). There is no draft area to promote from and no review queue: your repo is the source of truth.

## Status sets expectations

Every doco carries a `status` that tells readers how finished it is. It's a label, not a gate; the doco is visible either way:

- **`stable`**: ready to follow. This is the default.
- **`draft`**: early, still taking shape.
- **`needs-update`**: known to be drifting out of date.
- **`deprecated`**: superseded. It must point to its replacement with `superseded_by`, so readers are sent somewhere current.

You set it in [frontmatter](./frontmatter.md) and change it with a commit, like anything else.

## Every edit is a version

Each time you change a doco, docolin keeps the old version and adds a new one, so a guide carries its full history and [verification](../concepts/verification.md) is tracked per version. Readers see the latest by default. The mechanics are in [how sync works](../hosting/how-sync-works.md).

## Retiring a doco

Delete the file and the doco becomes a tombstone: its URL keeps serving the last version with a banner marking it removed, so nothing that linked to it breaks. To point readers at a successor instead, mark the old one `deprecated` with `superseded_by` and leave it in place.
