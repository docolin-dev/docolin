---
title: Verification and the Pango score
description: The Pango score is a 0 to 1000 measure of how strongly real people and agents have confirmed a guide works on real systems. Proof, not popularity.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/concepts/verification
  type: explanation

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 4m

  status: stable

  aliases: [verification, pango score, stamps, verified working, trust, proof]

  prev: ./soft-links.md
  next: ./attribution.md
---

# Verification and the Pango score

!!! info "In one line"
    The **Pango score** (0 to 1000) measures how strongly real people and AI agents have confirmed that a guide actually works on real systems. Higher means more, and stronger, proof.

Most docs tell you a guide is popular, or recently edited. Neither answers the only question that matters when you're about to follow it: _will these steps work on my machine?_ docolin answers that with verification.

## A stamp is a receipt

When someone runs a guide, they leave a **stamp**: a signed record of what happened, _this worked_ (or didn't), and when. There are three honest outcomes:

!!! cards { cols=3 }
    - **Worked**{ icon=check horizontal }
    - **Worked with caveats**{ icon=circle-alert horizontal }
    - **Didn't work**{ icon=x horizontal }

A stamp is signed to the stamper's account, or left through a one-click link if they aren't signed in. Pango keeps the ledger.

## The score is proof, not popularity

Pango rolls every stamp on a guide into one number from 0 to 1000. It is deliberately _not_ a vote count. What moves it:

- **Who stamped.** Someone whose past confirmations held up counts for more; an account that keeps vouching for things that turn out broken counts for less.
- **People and agents both**, each weighted for what it's good at.
- **Freshness.** Old confirmations fade, so the score reflects whether a guide _still_ works, not whether it worked two years ago.
- **No stuffing.** You can't stamp ten times to count ten times, and a burst of anonymous stamps from one network is treated as a single voice.

So a high score is not "lots of people liked this." It's "confirmed to work, by people whose confirmations tend to hold up, recently, on real systems."

!!! note "Not verified yet is not the same as wrong"
    Until a guide has enough solid evidence, Pango shows **not verified yet** instead of a number. That means nobody has confirmed it, so treat it as unproven, not as broken. A brand-new, correct guide starts here, and the fastest way to help is to be the first to stamp it.

## Is it confirmed for _your_ machine?

A guide lists the setups it's written for (its `applies_to`), shown right on the page, and the Pango score tells you how well its steps have held up. Read them together. A high score on a guide whose setups match yours means people have confirmed these exact steps work, and that they likely work for you too. A high score on a guide written for a different setup proves less about your machine. That pairing, the score plus the setups a guide targets, is the same signal [soft links](./soft-links.md) use to rank the guides under a topic for each reader.

## You can close the loop

The single most useful thing you can do on docolin is stamp what you tried. [Readers stamp from the guide itself](../reading/verifying.md); [AI agents stamp over MCP](../mcp/connect.md), signing the outcome to your account. Every stamp you leave is proof the next reader doesn't have to take on faith.
