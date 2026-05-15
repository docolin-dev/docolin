---
title: docolin frontmatter format
description: How to write the YAML frontmatter that every docolin guide starts with.
date: 2026-05-14
authors:
  - name: Oliver Seifert

docolin:
  schema_version: 1
  kind: tools/docolin/frontmatter-format
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 10m

  status: draft

  aliases: [frontmatter-spec, metadata-fields, guide-metadata]
---

# docolin frontmatter format

Every docolin guide starts with a YAML frontmatter block. It declares what the guide is about, who wrote it, who it applies to, and how it slots into the platform. The fields divide into two groups: **universal** fields that any Markdown tool understands, and a namespaced **`docolin:`** block for everything docolin-specific.

This document uses the format it describes. Read the frontmatter at the top of this file alongside the explanations below.

## The two layers

```yaml
---
# Universal layer: works with any Markdown tool
title: ...
description: ...
date: ...
authors: ...

# docolin layer: namespaced to avoid colliding with other site frontmatter
docolin:
  schema_version: 1
  kind: ...
  type: ...
  ...
---
```

Migrating from another platform (Jekyll, Hugo, Astro, etc.)? Your existing top-level fields stay where they are. You only need to add a `docolin:` block.

## Universal fields

### `title` (required)

The guide title. Shown in search results, browser tabs, social cards, RSS feeds.

### `description` (optional, strongly encouraged)

One-sentence elevator pitch. Used in search snippets, social cards, and AI citations through MCP. One field, two audiences. Keep it specific and concrete.

### `date` (optional)

Original publication date in `YYYY-MM-DD` form. Defaults to the file's first git commit. Useful when content was originally published elsewhere before being ingested into docolin.

### `authors` (required)

List of contributors. Each entry is either:

- `{ id: <docolin-user> }` for contributors with a docolin account, or
- `{ name: <string>, url: <optional-string> }` for external contributors.

```yaml
authors:
  - id: someuser
  - name: Alice Contributor
    url: https://alicecontributor.com
```

Attribution flows through to AI citations. When an MCP-grounded answer cites your guide, the listed authors get credit.

## The docolin block

### `schema_version` (required)

Which version of this spec the file was authored against. Always set to the current schema version. The parser uses this to migrate older files cleanly when the spec evolves.

### `kind` (required)

The canonical path of this guide in the docolin taxonomy.

```yaml
kind: data/postgres/replication/setup
```

Rules:

- **Lowercase, kebab-case** segments.
- **Depth 2 to 5.** Hard cap at 5 enforced by the validator.
- **First segment** must be one of the fixed top-level domains.
- **Second segment** must be a known subject within that domain (curated through the kinds registry).
- **Below that**, free-form. Authors choose what makes sense.

Current top-level domains:

| Domain         | Scope                                              |
| -------------- | -------------------------------------------------- |
| `os/`          | Operating systems                                  |
| `hardware/`    | Physical components                                |
| `software/`    | Applications and runtimes that don't fit elsewhere |
| `data/`        | Databases, queues, caches, storage formats         |
| `network/`     | DNS, firewall, VPN, protocols, routing             |
| `security/`    | Auth, encryption, hardening, secrets               |
| `cloud/`       | Cloud providers and their services                 |
| `devops/`      | CI/CD, IaC, observability, orchestration           |
| `programming/` | Languages, frameworks, libraries, paradigms        |
| `tools/`       | Developer tools that are not OS-bound              |
| `blog/`        | Blog posts, organized as `blog/{handle}/{slug}`    |

These top-level domains are **reserved handle names**: no user or organization on docolin can claim a handle that collides with one of them. This is what lets URLs disambiguate kind paths from hard links (see [URLs](#urls) below).

Soft links in the body resolve against this field. If a guide writes `{{kind: network/firewall/setup}}`, the resolver picks the best-matching guide with that kind for the reader's setup.

## URLs

docolin has two URL shapes, mirroring the two ways to link to content.

### Soft URLs (by kind)

```
docolin.com/{kind-path}
```

Examples:

- `docolin.com/network/firewall/setup`
- `docolin.com/data/postgres/replication/setup`
- `docolin.com/blog/someuser/cloudflare-r2-over-s3`

When a reader hits a soft URL, the platform resolves the kind to the best-matching guide for that reader's setup and **redirects to the corresponding hard URL**. The soft URL is a redirect endpoint; the reader's address bar ends up showing the hard URL. This means a link someone shares always points to the same specific guide.

Soft URLs are the right thing to use in body markup (`{{kind: ...}}`) when you want "whichever guide fits the reader." They're the wrong thing to share verbatim if you want everyone to land on the same content.

### Hard URLs (by source)

```
docolin.com/{org-or-user}/{project}/{path-from-project-root}
```

Examples:

- `docolin.com/cloudflare/cloudflare-docs/r2/buckets/setup`
- `docolin.com/someuser/my-blog/2026-04-02-cloudflare-r2-over-s3`

Hard URLs always point at a specific file in a specific project, regardless of the reader's setup. They're what a soft URL resolves to once the platform picks a guide.

A hard URL with no version suffix serves the **latest published version** of the guide. "Published" here means the most recent version docolin has ingested and published, not the latest commit on the upstream source. Predictable: the URL only changes content when docolin's sync runs.

### Pinned hard URLs

To pin to a specific version, append `@{version}`. The version is either a commit hash or a git tag from the source repository:

```
docolin.com/{org}/{project}/{path}@{version}
```

Examples:

- `docolin.com/cloudflare/cloudflare-docs/r2/buckets/setup@a3b4c5d`
- `docolin.com/cloudflare/cloudflare-docs/r2/buckets/setup@v2.3.0`

### `type` (required)

One of the four [Diátaxis](https://diataxis.fr) values:

- `tutorial` — learning-oriented. Walks a reader through learning something.
- `how-to` — task-oriented. Solves a specific problem.
- `reference` — information-oriented. Lookup material.
- `explanation` — understanding-oriented. Conceptual context.

Single-valued. Pick the dominant intent of the guide. The same topic can have multiple guides of different types (a `tutorial` for newcomers and a `reference` for experts), each at its own `kind`.

Blog posts use whichever Diátaxis value fits the post's intent. A release-notes post is `reference`. An opinion piece is `explanation`. A walkthrough is `tutorial`.

### `applies_to` (optional)

A flat list of facts the author asserts about where this guide applies: versions, runtimes, capabilities, prerequisites.

```yaml
applies_to:
  - postgres >= 14
  - tcp-network
  - root-or-sudo
```

Each entry is a fact, not a filter. The platform interprets these facts depending on context:

- **Soft-link resolver**: when multiple guides match the same `kind`, prefers the one whose `applies_to` matches the reader's setup.
- **Search ranking**: matching guides rank slightly higher; non-matching guides stay visible.
- **Browse pages**: rendered as informational labels next to the guide.
- **Explicit reader filters**: when a reader actively filters the UI ("only show Postgres 14+ guides"), `applies_to` is the field that filter reads.

A guide is **never hidden automatically** based on `applies_to`. It only disappears when the reader explicitly filters it out.

What strings are valid depends on the kind subtree. The kinds registry defines the vocabulary for each domain (`postgres`, `python`, `ubuntu`, `systemd`, `wayland`, etc.).

### `language` (required)

ISO 639-1 language code (`en`, `de`, `fr`, ...). Defaults to `en` if omitted.

Translations are simply the same `kind` with a different `language`. No other translation-specific fields are needed; whether a translation is in sync with its source is inferred from git timestamps.

### `difficulty` (optional)

How much prior knowledge the reader needs.

One of: `beginner`, `intermediate`, `advanced`, `expert`.

Subjective, but useful as a binary "is this for me right now?" signal, especially for newcomers.

### `time_estimate` (optional)

How long the guide takes (reading plus doing). Shorthand: `15m`, `2h`, `30m-1h` for a range. Author-provided, not derived from word count, since "doing time" depends on the task.

### `status` (required, defaults to `stable`)

How current and reliable the content is.

| Value          | Meaning                                                      |
| -------------- | ------------------------------------------------------------ |
| `stable`       | Content is current and verified. Default.                    |
| `draft`        | Work in progress, not ready for general readers.             |
| `needs-update` | Known to be outdated for current versions, but still useful. |
| `deprecated`   | Superseded. Readers should be sent elsewhere.                |

When `status: deprecated`, `superseded_by` is required.

The platform weights status when ranking and when citing through MCP. A `needs-update` guide ranks lower than a `stable` guide on the same topic.

### `superseded_by` (required when `status: deprecated`)

A `kind` reference to the guide that replaces this one. The platform redirects readers and updates citations.

```yaml
status: deprecated
superseded_by: data/postgres/replication/setup
```

### `aliases` (optional)

Phrases readers might use to find this guide, written the way someone would say or type them.

```yaml
aliases:
  - Postgres replication
  - Hot standby setup
  - Primary-replica configuration
```

Feeds the search index as title-equivalent phrases. May be shown to readers as "also known as." The validator warns above 10 entries; lists much longer than that usually mean keyword stuffing.

Use this for guide-specific alternate names, like "RTX driver" for an Nvidia proprietary driver guide. General synonyms across the platform (such as GPU and graphics card) are handled by the platform-wide synonym dictionary.

### `references` (optional)

URLs of external sources this guide cites or builds on: papers, CVEs, vendor advisories, upstream documentation, RFCs, anything authoritative that lives outside docolin.

```yaml
references:
  - https://nvd.nist.gov/vuln/detail/CVE-2024-12345
  - https://arxiv.org/abs/2504.18327
  - https://www.freedesktop.org/software/systemd/man/systemd.network.html
```

The platform infers the source type from the URL pattern (NVD, arXiv, RFC editor, etc.) and surfaces structured citations in MCP responses. AI tools returning this guide can chain back to the cited sources, preserving attribution upstream of docolin.

Order matters by convention: list the most authoritative source first. A reference doc that shadows an upstream man page should list the man page first; a security writeup should usually lead with the canonical CVE.

### `prev` and `next` (optional)

Hard links to other guides, rendered at the bottom of the page. Useful for multi-part series, learning paths, or just nudging readers toward the next thing.

These are hard links, not kind references: they always point at the same specific guide, regardless of the reader's setup.

Two ways to write them:

```yaml
# Relative file path in the same project (most common):
prev: ./concepts.md
next: ./failover.md
```

```yaml
# Full hard reference across projects:
next: /cloudflare/cloudflare-docs/replication/failover
```

## Worked examples

### A Postgres how-to

```yaml
---
title: Set up Postgres streaming replication
description: Configure a primary and a hot-standby Postgres node for read scaling and failover with zero downtime.
date: 2026-05-12
authors:
  - id: someuser

docolin:
  schema_version: 1
  kind: data/postgres/replication/setup
  type: how-to

  applies_to:
    - postgres >= 14
    - tcp-network
    - root-or-sudo

  language: en
  difficulty: intermediate
  time_estimate: 30m

  status: stable

  aliases:
    - Postgres replication
    - Hot standby setup

  prev: ./concepts.md
  next: ./failover.md
---
```

### A blog post

```yaml
---
title: Why we picked Cloudflare R2 over S3
description: Our reasoning, the costs, and what we'd do differently.
date: 2026-04-02
authors:
  - id: someuser

docolin:
  schema_version: 1
  kind: blog/someuser/cloudflare-r2-over-s3
  type: explanation

  language: en

  status: stable

  aliases:
    - Why we chose R2 over S3
    - Cloudflare R2 decision
---
```

Blog posts skip `applies_to`, `difficulty`, `time_estimate`, and other fields that don't make sense for a time-anchored personal piece. The validator dispatches based on the top-level kind.

### A hardware reference

```yaml
---
title: NVIDIA proprietary driver: kernel module reference
description: Module parameters, log locations, and runtime tunables for the NVIDIA proprietary driver.
date: 2026-03-18
authors:
  - id: someuser

docolin:
  schema_version: 1
  kind: hardware/gpu/nvidia/driver-reference
  type: reference

  applies_to:
    - linux
    - nvidia-proprietary-driver

  language: en
  difficulty: advanced

  status: stable

  aliases:
    - Nvidia driver parameters
    - Kernel module options

  references:
    - https://download.nvidia.com/XFree86/Linux-x86_64/README/index.html
    - https://docs.kernel.org/admin-guide/kernel-parameters.html
---
```

## Extending other docs

If you already have docs in another format (AsciiDoc, reStructuredText, MDX), you don't need to migrate the content. Each format has its own way of expressing metadata, and the platform reads it natively. Write metadata the way your format expects it; the body stays unchanged.

Markdown and MDX use YAML frontmatter (as shown throughout this document). AsciiDoc and reStructuredText use flat attribute spaces, so the nested `docolin:` block gets flattened with a `docolin-` prefix. Lists become comma-separated.

### AsciiDoc

```adoc
= NVIDIA driver install
:description: Install the proprietary Nvidia driver.
:revdate: 2026-05-12
:authors: someuser

:docolin-schema-version: 1
:docolin-kind: hardware/gpu/nvidia/driver-install
:docolin-type: how-to
:docolin-applies-to: ubuntu >= 22.04, systemd
:docolin-language: en
:docolin-difficulty: beginner
:docolin-status: stable
:docolin-aliases: Nvidia GeForce drivers, RTX driver setup

== Prerequisites

...
```

### reStructuredText

```rst
NVIDIA driver install
=====================

:Description: Install the proprietary Nvidia driver.
:Date: 2026-05-12
:Authors: someuser

:docolin-schema-version: 1
:docolin-kind: hardware/gpu/nvidia/driver-install
:docolin-type: how-to
:docolin-applies-to: ubuntu >= 22.04, systemd
:docolin-language: en
:docolin-difficulty: beginner
:docolin-status: stable
:docolin-aliases: Nvidia GeForce drivers, RTX driver setup

Prerequisites
-------------

...
```

### MDX

MDX is Markdown with JSX components. The frontmatter is identical to plain Markdown.

```mdx
---
title: NVIDIA driver install
description: Install the proprietary Nvidia driver.
date: 2026-05-12
authors:
  - id: someuser

docolin:
  schema_version: 1
  kind: hardware/gpu/nvidia/driver-install
  type: how-to
  language: en
  status: stable
---

<Callout type="warning">Back up your `xorg.conf` first.</Callout>

# NVIDIA driver install

...
```

## Validation

A guide is valid when:

- All required fields are present (`title`, `authors`, `schema_version`, `kind`, `type`).
- `kind` matches the registered taxonomy and is between 2 and 5 segments deep.
- `type` is one of the four Diátaxis values.
- `aliases` is a list of strings (a warning is emitted above 10 entries; no hard cap).
- `references` is a list of well-formed URLs.
- If `status: deprecated`, `superseded_by` is present and resolves to an existing kind.
- `applies_to` entries are recognized by the kinds registry for this subtree.
- `prev` and `next` resolve to existing guides (by file path within the project or by full hard reference).

The validator runs at publish time. Invalid guides are rejected with a specific message about what failed.

## What's intentionally not here

A few things you might expect to see and won't:

- **Tags.** Replaced by the more focused `aliases` plus a platform-wide synonym dictionary.
- **Verified-working stamps.** Dynamic and server-aggregated; they don't belong in author-edited frontmatter.
- **Maintainers.** Derived from git activity and from the organization owning the subtree.
- **Created or updated timestamps.** Derived from git history.
- **Reading time.** Derived from word count.
- **Translation links.** Derived from same-kind-different-language plus git timestamps.
