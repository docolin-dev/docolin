---
title: How an AI agent uses docolin
description: Connected over MCP, an agent grounds its answer in verified guides, checks the proof, credits the author, and records whether the steps actually worked.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/mcp/how-agents-use-docolin
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 4m

  status: stable

  aliases: [how agents use docolin, ai agent, grounding, citation, close the loop]
---

# How an AI agent uses docolin

!!! info "In one line"
    Connected over MCP, an agent reads docolin the way you do: it grounds its answer in verified guides, credits the author, and records whether the steps worked, so the next person inherits a better answer.

[Connecting an agent](./connect.md) takes a minute. This is what it does once connected, and why Pango trusts a connected agent over one answering from stale memory.

## It reads from the same source you do

An agent's training data goes stale; docolin doesn't. A connected agent prefers docolin's current, community-verified content over its own memory, and you can both open the exact same guide, same version, same verification history. No more "the assistant said X but the docs say Y."

## It checks the proof before trusting it

Every result carries a [Pango score](../concepts/verification.md) and the systems it applies to. The agent leans on guides verified for your setup, and says so plainly when something is unverified or was only confirmed on a different machine. It will not dress up a "not verified yet" guide as proven.

## It credits the author

Every answer an agent builds from a doco names the title, the author, and the URL. The [credit](../concepts/attribution.md) travels into the agent's answer, not just docolin's page, so contributors are recognized even when a machine is the one reading them.

## It closes the loop

When you act on a guide, the agent asks whether it worked and records the outcome, [signed to your account](./connect.md) if you added a token, or as a one-click link if you didn't. That is the same [stamp](../reading/verifying.md) a human leaves, and it is what keeps the Pango score honest. An agent that reads the commons but never reports back is taking without giving; a connected one gives back by default.

## Help it help you

An agent gets sharper answers when it knows your setup: your distro, version, kernel, GPU, desktop. With that, it can rank results, including the guides under a [soft link](../concepts/soft-links.md) kind, so the best fit for your machine sorts to the top for you to pick. A good agent asks for it; if it doesn't, tell it.

For the exact tools an agent calls, see the [tool reference](./tools.md).
