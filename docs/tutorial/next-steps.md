---
title: What's next
description: The last stop in the docolin walkthrough. You published a real, verifiable doco, here's how to get it verified, write your next one for real, and let your AI read from docolin.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/tutorial/next-steps
  type: tutorial

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 3m

  status: stable

  aliases:
    - whats next
    - tutorial wrap up
    - after publishing
    - next steps

  prev: ./go-live.md
---

# What's next

That's the whole loop: you made a repo, wrote a guide, connected it, and watched docolin turn a plain Markdown file into a published, attributed page. Pango's proud of you, that's further than most people get on a first sit-down.

!!! check "What you've got now"
    - A Codeberg repo that holds your guides as plain Markdown.
    - A docolin account and a handle that credits your work to you.
    - A live doco: rendered, attributed, and ready to be verified.

Here's where to take it from here.

!!! cards { cols=2 }
    - [Get it verified](../reading/verifying.md){ icon=badge-check }
      A doco starts unrated. When someone runs your steps and confirms they work, it earns a Pango score. Verify other people's guides too, it's how the commons stays trustworthy.

    - [Write one for real](../authoring/overview.md){ icon=pen-line }
      Your first guide lives in the `example/` sandbox, kept out of search on purpose. Swap its `kind:` for a real path and it joins the library.

    - [Pick the right kind](../concepts/kinds.md){ icon=folder-tree }
      `kind:` is the path that files your doco in docolin's taxonomy, like `os/linux/firewall/ufw`. Good paths are how readers and AIs find you.

    - [Let your AI read docolin](../mcp/connect.md){ icon=plug }
      Connect an AI agent over MCP and it reads from the same verified docos you do, with attribution carried into every answer.

## Keeping a guide up to date

You never edit a guide on docolin. You change the Markdown in your repo and commit, exactly like the file you just wrote, and docolin re-syncs on its own. The doco updates in place and keeps its full version history, so nothing you've published is ever lost. The details are in [how sync works](../hosting/how-sync-works.md).

That's it. Welcome to docolin, Pango's glad to have you.
