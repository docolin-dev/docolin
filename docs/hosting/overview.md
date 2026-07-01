---
title: Host your docs on docolin
description: docolin reads your docs straight from a public GitHub or Codeberg repo and keeps them in sync. Pick the path that fits you, from never-made-a-repo to already-fluent.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/hosting/overview
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases: [host your docs, hosting, publish, add your project, connect a repo]
---

# Host your docs on docolin

!!! info "In one line"
    docolin reads your docs straight from a public git repo, on GitHub or Codeberg, and keeps them in sync. Point it at your repo once, and docolin takes it from there.

Pango writes his guides as Markdown in a git repo, the way you already do, and docolin reads straight from it, no separate CMS to learn, no copy-paste. It syncs that repo and turns each file into a [doco](../concepts/overview.md): searchable, versioned, and open to verification and discussion.

!!! tip "Want the whole journey, guided?"
    The [tutorial](../tutorial/overview.md) walks you from zero to a published, verified, AI-readable doco, end to end. This page is the hosting reference; the tutorial is the path.

## What's here

This section is the reference. New to all this? Do the [tutorial](../tutorial/overview.md) first, it walks you from zero, then come back here for the details.

!!! cards { cols=2 }
    - [Connect a git repo](./connect-repo.md){ icon=git-pull-request }
      The fast path if you already know git: point docolin at your repo and set the docs folder.

    - [How sync works](./how-sync-works.md){ icon=refresh-cw }
      Polling, versions, what becomes a doco, and what happens when you delete one.

    - [Accounts, orgs, and projects](./accounts-orgs-projects.md){ icon=folder-tree }
      How it's organized: accounts own orgs, orgs hold projects, projects hold your docos.

    - [Manage a project](./manage-project.md){ icon=sliders-horizontal }
      The project page: sync status, fixing files that didn't publish, renaming, deleting.

## The one requirement

Your repo must be **public**. docolin content is public by design and there's no private-repo sign-in flow, so a public GitHub or Codeberg repo is all you need. Everything else (an account, an org to hold the project) you set up along the way.

## How it fits together

Your docs live in your repo. A docolin **project** points at that repo, and optionally a subfolder like `docs/`, inside an **org** you own. docolin handles the rest: an initial sync when you create the project, then it keeps up with your changes. The full model is in [accounts, orgs, and projects](./accounts-orgs-projects.md).
