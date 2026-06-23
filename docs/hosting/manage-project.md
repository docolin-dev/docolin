---
title: Manage a project
description: Your project's page is its control room, watch the sync, fix files that didn't publish, and rename or delete the project.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/hosting/manage-project
  type: how-to

  applies_to:
    - docolin

  language: en
  difficulty: intermediate
  time_estimate: 4m

  status: stable

  aliases: [manage project, project settings, sync status, fix sync errors, rename project, delete project]
---

# Manage a project

!!! info "In one line"
    Your project's page is its control room: it shows whether the last sync worked, lists any files that didn't publish, and is where you rename or delete the project.

You publish by pushing to your repo, so day to day there is little to manage, which suits Pango fine. When you do need to look, almost everything lives on the project's page.

## Watch the sync

The project page shows the current state, **synced** (with when it last ran), **syncing**, or **error**, and updates on its own as a sync finishes. The first sync fires when you create the project; after that, docolin re-checks on a [schedule](./how-sync-works.md).

## Fix what didn't sync

When a file can't be published, it is listed with the reason: invalid frontmatter, an author handle that doesn't exist, an asset that's too large, a fetch that failed. Each comes with a copyable prompt you can hand to your editor or an AI to fix it. Correct the file in your repo, push, and the next sync clears the error. The rest of your docos publish regardless; one bad file never blocks the whole project.

## Rename or delete

In the project's **Settings**:

- **Rename** changes the display name shown on docolin. The slug in the URL is permanent and never changes, so existing links keep working; renaming only touches the human-readable name.
- **Delete** takes the project down. It sits in the danger zone and asks you to type the slug to confirm. Nothing is destroyed: the docos are marked deleted (their pages show a removed banner) but kept, along with every version, discussion, and verification. Recreate the same project from the same repo and it all comes back, history and all. To take a guide down for good, that's the upstream repo's job: remove the file and the doco [tombstones](./how-sync-works.md) on the next sync.

## Instant updates

docolin keeps up by polling about once a day (hit **Refresh** to pull a new commit sooner), or turn on [auto-sync on push](./auto-sync-on-push.md) so every push refreshes within seconds.
