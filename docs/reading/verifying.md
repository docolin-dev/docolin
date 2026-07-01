---
title: Verifying that a guide worked
description: When you've tried a guide, one tap records whether it worked on your system, the best feedback you can give the next reader.
authors:
  - handle: imgajeed
  - name: Claude
    url: https://claude.ai

docolin:
  schema_version: 1
  kind: tools/docolin/reading/verifying
  type: how-to

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 2m

  status: stable

  aliases: [verify, stamp, confirm it worked, leave a stamp, did it work]
---

# Verifying that a guide worked

!!! info "In one line"
    When you've tried a guide, one tap records whether it worked on your system. Few things help the next person more.

## One tap at the end of the guide

Below every doco are three buttons:

!!! cards { cols=3 }
    - **Worked**{ icon=check horizontal }
    - **Worked with caveats**{ icon=circle-alert horizontal }
    - **Didn't work**{ icon=x horizontal }

Pick the one that matches your run. That's the whole thing, no form, no essay, and it works even with JavaScript off (the buttons submit a plain form, then upgrade to a tap-and-stay when scripts are on).

## Signed in counts for more

Signed in, your stamp is attributed to you and carries your [track record](../concepts/verification.md), which is part of how much it moves the score. Signed out, docolin nudges you to sign in: an anonymous stamp still registers, but it counts for much less, because docolin can't weigh a name it doesn't know.

## Why it matters

Every stamp feeds the [Pango score](../concepts/verification.md), which is how the next reader knows whether to trust the guide before following it. Confirming the ones that worked, and flagging the ones that didn't, is what keeps the commons honest and Pango's ledger worth trusting. A guide nobody has stamped stays "not verified yet" until someone like you reports back.

If you read docolin [through an AI agent](../mcp/connect.md), it can do this for you: tell it whether the steps worked, and it records the outcome on your behalf, adding a short note of any caveat it ran into.
