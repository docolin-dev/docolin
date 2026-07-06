# docolin

> Documentation that proves itself. An open commons for technical knowledge, verified on real systems, owned by no one, read by humans and AI.

## The vision

Knowledge on the internet in 2026 is fragmented and stale. ArchWiki is technically the best Linux resource but scares newcomers. Friendly resources are scattered blog posts with no structure. AI hallucinates because there's no clean, current, community-verified dataset to ground against. Contributors burn out as LLMs scrape their work without attribution.

docolin is a community-driven knowledge platform built to be the substrate AI grounds against and humans actually enjoy reading. We launch with Linux help for newcomers (Win10 EOL is sending a generational migration wave), but the architecture is content-agnostic from day one. Whether you write Linux troubleshooting guides, framework references, hardware reviews, or gardening how-tos, the same platform handles the boring 95% so you focus on the content.

Free for everyone, forever. No paid plan, no private docs, no premium tier. Funded by sponsorship from infrastructure companies whose tooling benefits from being part of the substrate AI grounds against.

## Core ideas

- **Path-based kinds taxonomy** like `hardware/gpu/nvidia/driver-install`, so hierarchy emerges naturally and fallbacks work for free
- **Soft links** that resolve to the right guide based on the reader's setup (Ubuntu reader gets UFW, Fedora reader gets firewalld, same link)
- **Verified-working stamps** from real users and agents on real systems, a signed record per version, not a popularity counter
- **Git-source projects**: point docolin at any git repo, sync on push, PRs and issues stay in your existing workflow
- **AI-native via MCP** with attribution baked into every citation, so contributors get credit when their work is used
- **Open source under AGPL**, so the platform can't be acquired and locked down, only forked and improved

## Status

Pre-alpha. Building toward v1.

All work happens directly on `main`. There is no stable branch yet, no release tags, and no guarantee that any commit builds or that the schema, URLs, or APIs are stable. Expect breakage. Once we tag v1, `main` will become the released line and feature work will move to short-lived branches with PRs.

## Stack

SvelteKit (Svelte 5, runes) · Tailwind CSS 4 · shadcn-svelte · ParaglideJS · Bun.

## Getting started

```sh
bun install
bun run dev
```

Other scripts:

```sh
bun run build          # production build
bun run preview        # preview the production build
bun run check          # prettier + eslint + svelte-check
bun run format         # auto-format with prettier
bun run lint:fix       # auto-fix lint issues
```

See [`CLAUDE.md`](./CLAUDE.md) for code style, design system, and conventions.

## Sponsors

Sponsorship buys visible thanks, never influence over content, ranking, or verification. Read more about [how docolin is funded](https://docolin.com/sponsor).

<a href="https://neon.com"><picture><source media="(prefers-color-scheme: dark)" srcset="./static/sponsors/neon-logo-dark.svg"><img src="./static/sponsors/neon-logo-light.svg" alt="Neon" height="40"></picture></a>

Sponsored by [Neon](https://neon.com), the serverless Postgres that every doco, discussion, and verification record lives in.

## Contact

- **General**: <hello@docolin.com>
- **Support**: <support@docolin.com>
- **Security**: <security@docolin.com> (see [SECURITY.md](./SECURITY.md))

All addresses are hosted on Proton Mail and support end-to-end encryption.

## License

[AGPL-3.0](./LICENSE)

---

_Mascot: a pangolin. Overlapping scales like a structured knowledge tree, curls up to defend itself like docs that actually protect the people reading them._
