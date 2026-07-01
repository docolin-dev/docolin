---
title: Frontmatter
description: The YAML block at the top of every doco that says what it is, who wrote it, where it belongs in docolin's taxonomy, and how it's verified and versioned.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/frontmatter
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 12m

  status: stable

  aliases: [frontmatter format, metadata fields, yaml header, guide metadata]

  prev: ./preview.md
  next: ./text-and-lists.md
---

# Frontmatter

!!! info "In one line"
    The YAML block at the top of every doco that says what it is, who wrote it, and where it belongs.

Before Pango can publish his guide to the high bar, docolin needs to know a few things about it: what it is called, who wrote it, and where it belongs. All of that lives in the **frontmatter**, a small block of YAML between two `---` fences at the very top of every doco.

This page is itself a doco. Read the frontmatter at the top of this file alongside the explanations below; it uses exactly the format it describes.

## The two layers

Frontmatter has two parts: **universal** fields any Markdown tool understands, and a namespaced **`docolin:`** block for everything docolin-specific.

```yaml
---
# Universal layer: works with any Markdown tool
title: ...
description: ...
authors: ...

# docolin layer: namespaced so it never collides with other site frontmatter
docolin:
  schema_version: 1
  kind: ...
  type: ...
  ...
---
```

docolin is additive. Migrating from Jekyll, Hugo, or Astro? Your existing top-level fields stay exactly where they are. You only add the `docolin:` block alongside them; nothing to flatten or rename.

## Universal fields

### `title` (required)

The guide's headline. Shown in search results and browser tabs.

### `description` (strongly encouraged)

A one-sentence elevator pitch. It becomes the search snippet and the summary an AI shows when it cites you through MCP. One field, two audiences, so make it specific and concrete.

!!! note "Planned"
    Social cards (Open Graph / Twitter), per-project RSS feeds, and the full SEO surface are planned. When they ship, `title` and `description` are what they will use.

### `authors` (required)

Who gets the credit. A list, where each entry is one of two shapes:

```yaml
authors:
  - handle: someuser
  - name: Alice Contributor
    username: alice
    url: https://github.com/alice
```

- `{ handle: <docolin-handle> }` for contributors with a docolin account.
- `{ name: <string>, username?: <string>, url?: <string> }` for external contributors.

Each entry has exactly one of `handle` or `name`. `handle` entries resolve to the user's internal account id at sync time, so credit stays pinned to the right account. External entries are stored as written; docolin does not try to auto-match them to accounts.

Authors are written by hand, not scraped from git history. A source repo that wants updated credit edits the frontmatter. Attribution flows all the way through to AI citations: when an MCP-grounded answer cites your guide, the listed authors are who it names.

## The docolin block

### `schema_version` (required)

Which version of this spec the file was authored against. Always set it to the current version. The parser uses it to migrate older files cleanly as the spec evolves.

```yaml
schema_version: 1
```

### `kind` (required)

The canonical path of this guide in the docolin taxonomy. The why behind paths-not-tags is in [kinds and the path taxonomy](../concepts/kinds.md).

```yaml
kind: data/postgres/replication/setup
```

Rules:

- **Lowercase letters, digits, hyphens, or underscores** per segment (kebab-case by convention).
- **Depth 2 to 5.** The hard cap of 5 is enforced.
- **First segment** must be one of the fixed top-level domains below.
- **Below that**, free-form. Authors choose what makes sense.

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
| `example/`     | Sandbox for testing and tutorials (see below)      |

!!! info "The `example` sandbox"
    A doco whose kind starts with `example/` is published and served at its URL, and you can stamp it, but it is **excluded from search, browse, trending, and crawler indexing**. It's the space for trying things out and for the [tutorial](../tutorial/overview.md), so first guides and experiments never clutter the real taxonomy. Move it to a real domain when it's ready to be found.

!!! warning "These domains are reserved handles"
    No user or organization can claim a handle that collides with a top-level domain. That is what lets a URL tell a kind path apart from a project path. See [Links & navigation](./links-and-navigation.md) for how `kind` drives soft URLs.

!!! note "Planned"
    A curated registry for the second segment (the known subjects within each domain) is planned. Today the first-segment domain, the segment count, and the character class are enforced; the rest is free-form.

### `type` (required)

One of the four [Diátaxis](https://diataxis.fr) values:

- `tutorial`: learning-oriented. Walks a reader through learning something.
- `how-to`: task-oriented. Solves a specific problem.
- `reference`: information-oriented. Lookup material.
- `explanation`: understanding-oriented. Conceptual context.

Single-valued: pick the dominant intent. The same topic can have several guides of different types, each at its own `kind`. [Writing well](./writing-well.md) digs into how to choose.

### `applies_to` (optional)

A flat list of facts about where the guide applies: versions, runtimes, capabilities, prerequisites.

```yaml
applies_to:
  - postgres >= 14
  - tcp-network
  - root-or-sudo
```

Each entry is a fact, not a filter. The platform reads these facts differently depending on context: [soft-link](../concepts/soft-links.md) ranking favors guides whose facts match the reader's setup; search ranks matching guides slightly higher; browse pages show them as labels; and a reader who actively filters ("only Postgres 14+") filters on this field.

!!! info "A guide is never hidden automatically"
    `applies_to` only narrows a guide when a reader explicitly filters it out. So an overly specific list costs you reach, not visibility.

!!! note "Planned"
    Validating the vocabulary against a per-domain registry is planned. Today any string is accepted.

### `language` (optional, defaults to `en`)

ISO 639-1 code (`en`, `de`, `fr`, ...). Defaults to `en` if omitted. A translation is simply the same `kind` with a different `language`; whether it is in sync with its source is inferred from git timestamps.

### `difficulty` (optional)

How much prior knowledge the reader needs: `beginner`, `intermediate`, `advanced`, or `expert`. Subjective, but a useful "is this for me right now?" signal, especially for newcomers.

### `time_estimate` (optional)

How long the guide takes, reading plus doing. Shorthand: `15m`, `2h`, `1h30m` for a single value, `30m-1h` for a range. Author-provided, because "doing time" does not follow from word count.

### `status` (optional, defaults to `stable`)

How current and reliable the content is.

| Value          | Meaning                                          |
| -------------- | ------------------------------------------------ |
| `stable`       | Current and verified. The default.               |
| `draft`        | Work in progress, not ready for general readers. |
| `needs-update` | Known to be outdated, but still useful.          |
| `deprecated`   | Superseded. Readers should be sent elsewhere.    |

Status feeds ranking and citations: a `needs-update` guide ranks below a `stable` one on the same topic.

!!! danger "Deprecated needs a forward pointer"
    When `status: deprecated`, `superseded_by` is required. The file is rejected without it, so a deprecated guide always points readers (and AI citations) somewhere current.

### `superseded_by` (required when deprecated)

A link to the guide that replaces this one. Accepts any link form, relative path, hard URL, soft URL by kind, or external URL.

```yaml
status: deprecated
superseded_by: /data/postgres/replication/setup
```

### `aliases` (optional)

Phrases a reader might use to find the guide, written the way they would say them.

```yaml
aliases:
  - Postgres replication
  - Hot standby setup
  - Primary-replica configuration
```

These feed the search index as title-equivalent phrases, so a reader who searches for "Postgres replication" finds a guide titled "Set up streaming replication" too. Use aliases for guide-specific alternate names ("RTX driver" for an Nvidia driver guide); platform-wide synonyms (GPU, graphics card) are handled centrally, so you do not repeat them here.

!!! note "Planned"
    A warning above 10 entries (the usual sign of keyword stuffing) is planned. Today any length is accepted silently.

### `references` (optional)

URLs of external sources the guide cites or builds on: papers, CVEs, vendor advisories, upstream docs, RFCs.

```yaml
references:
  - https://nvd.nist.gov/vuln/detail/CVE-2024-12345
  - https://www.freedesktop.org/software/systemd/man/systemd.network.html
```

The list is surfaced through MCP alongside the doco, so an AI returning your guide can chain back to what you cited. List the most authoritative source first.

### `prev` and `next` (optional)

Links to other guides, rendered at the bottom of the page, for a series or a learning path. Any link form works. See [Links & navigation](./links-and-navigation.md).

```yaml
prev: ./concepts.md
next: ./failover.md
```

### `sitemap` (optional)

A per-doco override of the project's sidebar. Most projects define one sidebar at the project level instead; both the file and this field are covered in [Links & navigation](./links-and-navigation.md).

## Worked examples

### A Postgres how-to

```yaml
---
title: Set up Postgres streaming replication
description: Configure a primary and a hot-standby Postgres node for read scaling and failover with zero downtime.
authors:
  - handle: someuser

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

### A blog post (Pango's)

```yaml
---
title: How to dismount the high bar
description: Land a high-bar dismount cleanly instead of rolling into an involuntary ball.
authors:
  - name: Pango

docolin:
  schema_version: 1
  kind: blog/pango/dismount-the-high-bar
  type: how-to
  language: en
  status: stable
---
```

Blog posts skip `applies_to`, `difficulty`, and the other fields that do not fit a time-anchored personal piece.

## Validation

A guide is valid when:

- The required fields are present: `title`, `authors`, `schema_version`, `kind`, `type`.
- `kind` starts with a real top-level domain and is 2 to 5 segments deep.
- `type` is one of the four Diátaxis values.
- `references` is a list of well-formed URLs.
- If `status: deprecated`, `superseded_by` is present.

Validation runs at publish time. An invalid guide is rejected with a specific message about what failed.

!!! note "Planned"
    Several deeper checks (registry-matched `kind` and `applies_to`, resolving `prev`/`next`/`superseded_by` to existing guides, the aliases warning) are planned. Today the shape and the rules above are enforced; a `prev`/`next` that doesn't resolve to a published doco isn't rejected, it just renders as a plain link instead of a rich card.

## Your keys survive publishing

docolin republishes every doco's raw Markdown (readers can grab it, and AI agents fetch it), and the frontmatter it carries stays **yours**: the fields you wrote, including any custom keys docolin doesn't know, are replayed as authored at the top level. They're the parsed fields re-serialized, so comments and quoting style aren't kept, the byte-exact file stays in your repo, but nothing you wrote is dropped or renamed.

Everything docolin resolves or computes lands under a single added key, `docolin_generated`: the resolved classification, a source pointer pinned to the exact commit, the live verification state, the version history, and the discussion link. Two things to know:

- **Don't author a `docolin_generated` key.** It is always overwritten with docolin's own block, so anything you put there is lost.
- **`authors` is replaced with the resolved credit list**, so a deleted account shows its retirement instead of leaking a stale handle.

A re-sync reads only your fields and ignores `docolin_generated`, so the round trip is safe: what you wrote in, you get back out.

## What's intentionally not here

A few fields you might expect and won't find, because docolin derives them instead of trusting hand-written values:

- **Tags**, replaced by the more focused `aliases` plus a platform-wide synonym dictionary.
- **Verified-working stamps**, which are aggregated from real readers, not declared by the author.
- **Reading time**, derived from the body's word count.
- **Created / updated timestamps**, derived from when the file synced.
- **Translation links**, derived from same-kind-different-language plus git timestamps.

## See also

- [Links & navigation](./links-and-navigation.md) for how `kind` becomes a URL, and how `prev`/`next` and the sitemap shape the reader's path.
- [Writing well](./writing-well.md) for choosing a `type` and structuring a doco that reads well.
