---
title: Links & navigation
description: Internal and external links, soft links by kind, hard and pinned URLs, prev/next, and the sidebar sitemap.
date: 2026-05-24
authors:
  - name: Oliver Seifert

docolin:
  schema_version: 1
  kind: tools/docolin/authoring/links
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: intermediate
  time_estimate: 9m

  status: draft

  aliases: [links, urls, soft links, hard links, sitemap, sidebar, navigation, versions]

  prev: ./footnotes-and-annotations.md
  next: ./writing-well.md
---

# Links & navigation

A doco is rarely alone. Pango's guide to the high bar wants to point at the warm-up routine, the gym map, and the burrow next door. This page is about the links between docos, and the navigation, prev/next and the sidebar, that ties a whole project together.

## Everyday links

Ordinary Markdown links do what you expect:

```md
A [relative link](./warm-up.md), an [anchor](#soft-links-by-kind), and an
[external link](https://lucide.dev).
```

- **Relative links** (`./warm-up.md`) point within your own project; the most common kind, and the most robust, since they move with your files.
- **Anchors** (`#heading-id`) jump within a page, using the [auto-generated heading ids](./text-and-lists.md#headings).
- **External links** open in a new tab with `rel="noopener noreferrer"` added for you.

Hover an internal link and docolin shows a small preview of the target's title and description, so a reader can judge whether to follow it without leaving the page.

## Soft links (by kind)

docolin has a second, more powerful kind of link: a link to a **kind path** rather than a specific file.

```md
See [setting up a firewall](/network/firewall/setup).
```

There is no special syntax; it is a normal link whose path is a [kind](./frontmatter.md#kind-required). When a reader follows it, docolin resolves that kind to the **best-matching guide for that reader's setup** and redirects there. An Ubuntu reader lands on the UFW guide; a Fedora reader on the firewalld one, from the very same link.

Reach for a soft link when you mean "whichever guide fits the reader." Avoid sharing one verbatim when you want everyone to land on the exact same content; for that, link the hard URL it resolves to.

## Hard URLs (by source)

A hard URL points at a specific file in a specific project, the same content for everyone:

```
docolin.com/{org-or-user}/{project}/{path-from-project-root}
```

For example, `docolin.com/cloudflare/cloudflare-docs/r2/buckets/setup`. With no version suffix, a hard URL serves the **latest published version**, the most recent commit docolin has synced and published, not necessarily the newest commit upstream. So the content only changes when a sync runs, which keeps shared links predictable.

!!! info "How docolin tells them apart"
    The first path segment decides. Because every top-level kind domain (`os`, `network`, `data`, ...) is a [reserved handle](./frontmatter.md#kind-required) that no user or org can claim, a leading `network/` is unambiguously a soft link and a leading `cloudflare/` is unambiguously a project.

## Pinned versions

To pin to an exact version, append `@{version}`, either a commit hash or a git tag from the source repo:

```
docolin.com/cloudflare/cloudflare-docs/r2/buckets/setup@v2.3.0
docolin.com/cloudflare/cloudflare-docs/r2/buckets/setup@a3b4c5d
```

A pinned URL never moves, even after the guide is updated, which is what you want in a changelog or a "this worked on version X" reference.

## prev and next

Set `prev` and `next` in [frontmatter](./frontmatter.md#prev-and-next-optional) to render previous/next links at the bottom of a page. They turn a pile of docos into a path, a tutorial series, a learning track, or just a gentle nudge onward. Any link form works.

```yaml
docolin:
  prev: ./concepts.md
  next: ./failover.md
```

(Every page in this guide uses them; that is the row of links below.)

## The sidebar

The sidebar shown beside a doco comes from a `doco_sitemap.yaml` file that lives **in your docs**, next to the pages it describes. Put one in your docs root and it covers the whole project:

```yaml
sitemap:
  - title: Getting started
    children:
      - title: Install
        url: ./install.md
      - title: First project
        url: ./first-project.md
  - title: Reference
    url: ./reference.md
```

It is a recursive list of `{ title, url?, children? }` entries. Each entry is **either** a link (has `url`) **or** a group (has `children`), never both. A `url` accepts any link form: relative path, hard URL, soft URL by kind, or external. `title` is always required.

### Cascading

A `doco_sitemap.yaml` applies to **its own folder and every folder beneath it**, until a nearer one takes over. So you can keep one sidebar for the whole project and, where a section needs its own, drop another `doco_sitemap.yaml` into that subfolder to override the parent for that subtree only.

```
docs/
  doco_sitemap.yaml        <- the default sidebar for everything under docs/
  install.md
  auth/
    doco_sitemap.yaml      <- overrides the sidebar for docs/auth/ and below
    signin.md
```

docolin resolves a doco by walking up from its folder and using the first `doco_sitemap.yaml` it finds. Files above your docs root never apply.

Two more layers of override sit on top:

- A single doco can replace its sidebar with a `sitemap` field in its own frontmatter.
- An **empty** `doco_sitemap.yaml` (or `sitemap: []`) is an explicit "no sidebar here" that shadows any parent, handy for opting one section out.

## Gotchas

- **Prefer relative links inside a project.** They survive moves and renames better than hard URLs to your own files.
- **Soft for "whichever fits," hard for "this exact one."** Mixing them up sends readers somewhere subtly wrong.
- **Sidebar entries are link XOR group.** An entry with both `url` and `children` is invalid; nest a link under the group instead.
- **Nearest wins.** A `doco_sitemap.yaml` deeper in the tree fully replaces the parent's for its subtree; the two are not merged.

## See also

- [Frontmatter](./frontmatter.md) for `kind`, `prev`/`next`, and the per-doco `sitemap` field.
- [Writing well](./writing-well.md) for how to structure a multi-page set so the navigation has something good to connect.
