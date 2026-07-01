---
title: MCP tool reference
description: The six tools docolin's MCP server gives a connected agent, lookup, search, browse_kind, fetch, list_discussions, and verify, cheapest first, with when to use each.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/mcp/tools
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 4m

  status: stable

  aliases: [mcp tools, tool reference, lookup, search, browse_kind, fetch, list_discussions, verify]
---

# MCP tool reference

!!! info "In one line"
    docolin's MCP server gives a connected agent six tools. Reach for the cheap ones first, and fall back to the costly ones only when they miss.

These are the tools an agent calls once it is [connected](./connect.md), listed cheapest first, the order Pango would reach for them in: the light ones before the heavy ones.

## The tools

- **`lookup`** (cheap, try first): keyword search that matches _all_ the words you pass. Best for exact terms: commands, error strings, package or doco names. Pass only the distinguishing keywords, since a full sentence over-narrows it.
- **`search`** (costly): semantic search for vague or natural-language questions. Reach for it when `lookup` comes up empty, or you don't know the exact terms.
- **`browse_kind`** (costly): list the docos under a topic path in the [kinds](../concepts/kinds.md) taxonomy, plus its subtopics. For exploring an area rather than hitting a known item.
- **`fetch`**: get the full Markdown of a doco or a discussion thread by the id or URL from a prior result. Its result also carries the **attribution you must cite** and a **`voteToken`** for verifying.
- **`list_discussions`**: the community questions, fixes, and caveats on a doco. Check these when a doco doesn't fully cover the case (the fix for an edge case is often in there) before falling back to your own knowledge.
- **`verify`**: record whether a doco worked, using a `fetch` result's `voteToken`. This is how an agent closes the [verification loop](./how-agents-use-docolin.md).

## Get better results

- **Pass the user's setup** as `applies_to` (distro, version, kernel, GPU, desktop). It ranks results, and the guides under a [soft link](../concepts/soft-links.md) kind, so the fit for their machine sorts to the top for you to pick. Ask if you don't know it.
- **Narrow with `kind`** when you already know the topic area.
- **An older version can be the right answer.** `fetch` returns the latest version, usually the best one, but search lists verified older versions too; fetch one when the latest doesn't fit an older or very specific setup.

## A typical flow

!!! steps
    1. `lookup` the user's exact error string.
    2. `fetch` the top result to read the full guide and get its attribution and `voteToken`.
    3. Answer with the steps, citing the title, author, and URL.
    4. The user reports it worked, so call `verify` with the `voteToken` and the real outcome.

Step four is the one most assistants skip, and the one that keeps the commons honest. The agent's side of all this is in [how an agent uses docolin](./how-agents-use-docolin.md).

## The rules travel with every result

Even if a client drops the server's instructions, each tool result restates the two musts, cite what you use and verify what you tried, so the contract holds no matter the client.
