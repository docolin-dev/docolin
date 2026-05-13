# docolin

> Documentation for everything technical. Owned by no one, accessible to everyone, structured for both humans and AI.

## The vision

Technical docs in 2026 are fragmented and stale. ArchWiki is technically the best but scares newcomers. Friendly sites are scattered blog posts with no structure. AI hallucinates because there's no clean ground-truth dataset for fast-moving technical content. Contributors burn out as LLMs scrape their work without attribution.

docolin is a community-driven docs platform built to be the substrate AI grounds against and humans actually enjoy reading. Launching with Linux as the first vertical (Win10 EOL is sending a generational wave of newcomers), architected from day one to scale across all technical documentation.

## Core ideas

- **Path-based kinds taxonomy** like `hardware/gpu/nvidia/driver-install`, so hierarchy emerges naturally and fallbacks work for free
- **Soft links** that resolve to the right guide based on the reader's setup (Ubuntu reader gets UFW, Fedora reader gets firewalld, same link)
- **Verified-working stamps** from real users on real systems
- **Git-source projects**: point docolin at any git repo, sync on push, PRs and issues stay in your existing workflow
- **AI-native via MCP** with attribution baked into every citation, so contributors get credit when their work is used
- **Open source under AGPL** so you can self-host, fork, or just trust it

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

## Contact

- **General**: hello@docolin.com
- **Support**: support@docolin.com
- **Security**: security@docolin.com (see [SECURITY.md](./SECURITY.md))

All addresses are hosted on Proton Mail and support end-to-end encryption.

## License

[AGPL-3.0](./LICENSE)
