---
title: docolin and your privacy
description: What docolin collects (the minimum), what it never does (no fingerprinting, no third-party trackers, no selling your data), and how your setup profile stays on your device.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/privacy
  type: reference

  applies_to:
    - docolin

  language: en
  status: draft

  sitemap: []

  aliases:
    - privacy
    - privacy policy
    - data collection
    - tracking
    - cookies
---

# docolin and your privacy

docolin is built privacy-first. The rule is simple: collect the minimum needed to run the platform, default to anonymous, and never sell or trade what little we hold. Here is what that means in practice.

## What we collect

As little as possible.

- **Reading docolin needs no account.** You can browse, search, and read every doco anonymously.
- **If you create an account**, we store what is needed to run it: your sign-in identity (handled by our authentication provider), your profile, and the things you create, like discussions, verifications, and access tokens.
- **If you verify a doco**, the stamp records your verdict. For abuse resistance it also stores a coarse, one-way code derived from your network neighborhood, never your address, so a burst of fake anonymous confirmations from one network counts as one voice instead of many. The code cannot be reversed into an address and is not used to identify or follow you.
- **Standard server logs** may briefly record requests to keep the service running and secure. They are not used to build a profile of you.

## What we never do

- **No fingerprinting.** We do not try to identify you across sessions by your device, browser, or network.
- **No third-party trackers or ad networks.** None. Any third-party integration is opt-in, never opt-out.
- **No selling or licensing your data.** Not to advertisers, not to AI labs. docolin is funded by [sponsors](/sponsor), not by your data.

## Your setup stays on your device

docolin tailors search to your setup, your distribution, version, and hardware, so you see guides that fit your machine. That profile is built and kept **entirely in your browser**. It is inferred locally from what you read, and it never leaves your device unless you choose to send a few tags along with a search to improve ranking.

## Account data

If you sign in:

- Authentication runs through a third-party provider, so docolin never sees your password.
- Your inbox and notifications are private to you. Everything else you publish on docolin is public by design (see the [terms](/terms)).
- API access tokens are stored hashed; we cannot read them back.
- **You can delete your account yourself**, from your account page. Your sign-in identity, email, handle, inbox, and tokens are removed for good. Public contributions (discussions, verifications) stay, shown under an anonymous deleted-user identity, because published knowledge is public by design; you can request deletion of individual posts before deleting the account.

## Analytics

Today, docolin runs **no analytics at all**.

!!! note "Planned"
    We intend to add privacy-friendly, self-hosted analytics (Plausible) to understand how traffic flows and improve the platform. When it ships it will be **cookieless**, record **aggregate traffic only**, never be tied to your identity, and never be sold. This page will be updated the day it goes live.

## Cookies

docolin uses only the cookies it needs to work, such as keeping you signed in. No advertising or cross-site tracking cookies.

## Your control

- You can read everything without an account.
- You can delete your account and the personal data attached to it.
- Public contributions may remain, and stay attributed, as part of the commons, the same way an edit history works on any wiki.

## Questions

Privacy questions or requests? Email us at <support@docolin.com>.
