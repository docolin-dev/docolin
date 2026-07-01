---
title: Connect a git repo
description: The fast path for git users, point docolin at a public GitHub or Codeberg repo, set the docs folder, and your Markdown publishes and stays in sync.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/hosting/connect-repo
  type: how-to

  applies_to:
    - github
    - codeberg

  language: en
  difficulty: intermediate
  time_estimate: 6m

  status: stable

  aliases: [connect a repo, add a project, link a repository, sync a repo]
---

# Connect a git repo

!!! info "In one line"
    If you already use git, connecting a repo takes about two minutes: paste the URL, set the docs folder, create. docolin syncs from there.

You know git already; this page is about the docolin side. You keep writing Markdown and committing the way you always do, and docolin reads straight from your public repo and turns each valid file into a published doco, no different from how Pango hosts his own.

!!! note "Brand new to all this?"
    If you've never made a repo before, the [tutorial](../tutorial/overview.md) walks you through it from scratch, the account, the repo, and your first guide, then come back here for the details.

!!! tip "Coming from Mintlify?"
    docolin imports Mintlify (`.mdx`) projects directly. Add a little frontmatter to each page and connect the repo as usual, see [import a Mintlify project](./import-mintlify.md).

## How docolin sees your repo

Three nested pieces, covered fully in [accounts, orgs, and projects](./accounts-orgs-projects.md):

- An **org** owns things. You get a personal one (named after your handle) the moment you create your account, and you can make more for a team or a brand.
- A **project** connects one repo (and optionally a subfolder) to docolin, inside an org you own. It's the thing that syncs.
- Each valid file in that repo becomes a **doco**, served at `/{org}/{project}/{path}`.

So "connecting a repo" means creating a project that points at it. Here's how.

## Connect it

!!! steps
    1. Open **New project** under the org that should own it (your personal org is there by default).
    2. Paste the repo's URL, for example `https://github.com/you/handbook` or `https://codeberg.org/you/handbook`. docolin detects the forge and your default branch, and rejects anything that isn't a reachable public repo.
    3. Confirm the **slug**. It autofills from the repo name; it has to be unique within your org and can't be a reserved word. Pick it carefully: the slug becomes part of every doco's URL, so it's permanent and can't be changed later.
    4. Set the **docs folder** if your docs live in a subdirectory like `docs/`. Leave it blank for the repo root. One repo can back several projects, each scoped to a different folder, so a monorepo is fine.
    5. **Create.** An initial sync runs right away, and your docos appear under the project.

## What becomes a doco

docolin publishes a file as a doco when it is Markdown, sits under your docs folder, and carries a valid `docolin` [frontmatter block](../authoring/frontmatter.md): a `kind`, a `type`, and at least one author. Files without that block are left alone, linked as plain repo files wherever a doco points at them, never published as docos themselves. A file with broken frontmatter is skipped (with the reason recorded on the project), while the rest still publish.

## Staying in sync

After the first sync, docolin re-checks your repo about once a day and pulls in what changed; to pull the latest commit sooner, hit **Refresh** on the project page, or turn on [auto-sync on push](./auto-sync-on-push.md) so every push refreshes within seconds. The full model, versions, tombstones for deleted files, and per-file errors, is in [how sync works](./how-sync-works.md).

## After it's connected

The project page is your control room: it shows the sync status, lists any files that didn't publish, and is where you rename or delete the project. See [manage a project](./manage-project.md).
