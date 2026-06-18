---
title: docolin moderation policy
description: How docolin moderates content, who can report it, the fixed set of reasons something is hidden or redacted, why disagreement is never one of them, and how to appeal.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/moderation-policy
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 7m

  status: stable

  sitemap: []

  aliases: [moderation, content-policy, reporting]
---

# docolin moderation policy

Pango's jungle gym only stays fun if it stays safe, and docolin is no different. Moderation is how we keep it a place people want to be: a small, predictable set of rules about what comes down, who decides, and how you push back when we get it wrong.

!!! info "Early platform, growing toolkit"
    docolin is pre-alpha. This page describes the policy as it is enforced today. The closing [Where this is heading](#where-this-is-heading) section lists capabilities we intend to add as the platform grows.

## What we moderate, and what we do not

docolin is a community-driven platform for technical knowledge. The discussion attached to a doco is part of the record around that doco, and we treat it that way: we preserve as much of it as we reasonably can.

We hide or redact content for a defined set of reasons, listed below, and for no others.

!!! note "Disagreement is not a moderation reason"
    We will not hide content because someone disagrees with it, finds it incorrect, or dislikes the tone. Those are matters for replies, edits, or discussion, not for moderation.

## How to report content

If you are logged in, every discussion and reply has a report option. Choose a reason, optionally add details, and submit.

You do not need to be a member of an organization or hold any special role. Anyone with a docolin account can report any public content.

## Report reasons

| Reason                          | What it covers                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Child sexual abuse material     | Content depicting or sexualizing minors. Hidden immediately on report. Reported to law enforcement where required.                    |
| Non-consensual intimate imagery | Intimate images shared without the subject's consent.                                                                                 |
| Threat of violence              | Credible threats against an identifiable person or group.                                                                             |
| Encouragement of self-harm      | Content actively encouraging someone to harm themselves.                                                                              |
| Doxxing                         | Sharing private personal information about someone else without consent (real name, address, employer, contact info, etc.).           |
| Leaked secret                   | Accidentally posted credentials: API keys, passwords, tokens, private keys, connection strings. We will help you scrub these quickly. |
| Harassment                      | Targeted abuse, slurs, or hostile content aimed at a specific person.                                                                 |
| Hate speech                     | Dehumanizing or demonizing content targeting a protected group.                                                                       |
| Defamation                      | False statements of fact about an identifiable person.                                                                                |
| Impersonation                   | Claiming to be someone you are not.                                                                                                   |
| NSFW or shock content           | Sexual content, gore, or shock material in a context where it is not appropriate.                                                     |
| Spam                            | Unsolicited promotion, repeated nonsense, or link bait.                                                                               |
| Dangerous content               | Instructions or advice that would cause real harm if followed.                                                                        |
| Embargo violation               | Material that was supposed to be held back: undisclosed security vulnerabilities, embargoed news, leaked exam questions, NDA content. |
| Copyright                       | Content posted in violation of someone else's copyright. We honor DMCA requests through a separate process.                           |
| Other                           | Something else. You must include details explaining the concern.                                                                      |

Some reports we will dismiss without further review:

- **"I disagree with this."** Reply to the discussion instead, or propose an edit.
- **"This is factually wrong."** Same. Correctness is for editing, not moderation.
- **"I dislike the tone."** We will look at edge cases, but tone alone is rarely actionable.
- **"I regret saying that."** Edit your comment or post a follow-up correction. Deletion-for-regret is not a moderation action we support.

## What happens after you report

Today every report goes to **platform staff** (the docolin maintainers). You will be notified through your docolin inbox when the report is resolved, with the outcome and any notes the reviewer left.

## What we can do to reported content

The actions are deliberately few, and which one we use depends on why the content was reported.

### Hide

The content is marked invisible to other readers. You, the author, can still see what you wrote, with a notice explaining that it has been hidden and why. Only platform staff can see a hidden item's original body. This is deliberate: the fewer people with ongoing access to harmful content, the better for everyone. A hide can be reversed (an unhide), and the audit log keeps both events.

### Privacy redaction

Used when the content itself contains data that should not exist in our database, like a real API key or someone else's personal information. A platform admin edits the comment to remove the specific content, and the original is **destroyed**. The reasoning is the same as hiding: keeping an API key in an admin-visible audit log is still keeping an API key. The redaction is logged; the redacted data itself is not.

### Hard delete

In rare cases (a court order, a mandatory removal under law, a GDPR right-to-erasure request where no exception applies), we may remove content entirely. This is unusual, irreversible, and only done with platform staff approval.

## Deletion requests

If your content needs to come down (typically a leaked secret you posted, or content the project owner wants removed), file a **deletion request** instead of a report. The content is hidden immediately while platform staff review the request and either approve the takedown or deny it and restore visibility.

Today, deletion requests can be filed by:

- The author of the content (asking for their own to come down).
- The organization that owns the project.
- Platform staff.

## If your content is reported or hidden

You will receive an inbox notification when an action is taken on your content. We do not tell you who reported it; we tell you what we did and why.

If your content is hidden or redacted, the notification includes the full reason. You can:

- See your own content with a "hidden" notice (no one else sees it).
- Reach out to platform staff (see [Appeals](#appeals)) if you believe the action was wrong, or if you want to address the concern and have the hide reversed.

Editing on its own does not reverse a hide; to restore visibility you have to address the underlying issue through support. You can still edit your comments normally when they are not hidden, and the edit history is preserved either way.

## Edit history

You can edit your own discussions and replies. We keep every prior version in an edit history that anyone can view by clicking the "edited" indicator on a comment. This is intentional: the conversation around a doco often references things people said earlier, and erasing that breaks the record.

**Each prior version is independently moderatable.** A secret that leaked in an older edit still renders in the public history panel until that one row is hidden or redacted; reports against a specific edit go through the same flow as reports against the live post.

If you want to take something back, edit it and explain, or post a follow-up correction. We do not provide a way to silently destroy your own past contributions.

## Reporter privacy

!!! note "We never reveal who reported"
    The person you reported never sees who flagged them. They see what we did and why, not who reported it. You see the outcome of your own reports through your inbox.

## Audit log

Every moderation action (dismiss, hide, unhide, redact, approve a deletion, deny a deletion) is recorded in an append-only audit log, including who took it and why. The log is internal to platform staff.

## Response times

!!! note "We won't pretend otherwise"
    docolin is maintained by a small team in their free time. We aim to respond as fast as we can, especially to urgent harm. Routine reports may take longer.

## Appeals

If you believe an action against your content was wrong, reach out to `support@docolin.com`. Platform staff will review the case.

## DMCA, court orders, and other legal process

For copyright takedown requests (DMCA), court orders, subpoenas, regulator demands, GDPR Article 17 erasure requests, or any other legal process, contact `support@docolin.com`. Standard DMCA format applies for copyright claims.

We will not silently comply with legal demands that we believe are overbroad or improper. We will tell affected users when we are able to do so.

## Where this is heading

These are capabilities we intend to add as docolin grows. Until they ship, the policy above describes what's actually in effect.

- **Doco moderators.** A per-doco moderator role (typically the publisher and anyone they delegate to) who can pin, mark as resolved, dismiss unwarranted reports, and file deletion requests on their own community's discussions. Until this lands, platform staff handles all of it.
- **Lock a discussion.** Mark a thread as closed to new replies while leaving existing content visible.
- **Embargo auto-lift.** A hide that carries a target date (typical for an embargoed security disclosure) becomes visible again automatically when the date passes, and the author is notified.
- **Per-doco routing.** Routine reports against a doco's discussions are seen first by that doco's moderators, with platform staff handling the urgent and legal categories directly.
- **Reporter signals.** Reporters who file many reports that are dismissed have their reports deprioritized; reporters acting in bad faith may be restricted.
- **Stale-report auto-escalation.** Unresolved reports automatically escalate to platform staff after a threshold.

## License of this policy

This policy is part of the docolin platform documentation, licensed AGPL-3.0 along with the rest of the project. Forks and self-hosted instances may adopt it, modify it, or replace it as they see fit. The principles here are our suggested defaults; the law of the jurisdiction where each instance operates always takes precedence.

## Feedback on this policy

This policy will keep evolving. If you think it is missing something, weighted wrong, or unclear, open a discussion on this doco or file an issue against `github.com/docolin-dev/docolin`. The moderation policy is itself moderated by the community, not handed down from the top bar.
