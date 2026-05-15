---
title: docolin moderation policy
description: How docolin handles reports, removals, and content moderation.
date: 2026-05-15
authors:
  - name: Oliver Seifert

docolin:
  schema_version: 1
  kind: tools/docolin/moderation-policy
  type: reference

  applies_to:
    - docolin

  language: en
  difficulty: beginner
  time_estimate: 10m

  status: draft

  aliases: [moderation, content-policy, reporting]
---

# docolin moderation policy

How docolin handles reports, removals, and content moderation. This is a living document and will evolve as the platform grows. The current version reflects design intent; some mechanisms described here are still being implemented.

---

## What we moderate, and what we do not

docolin is a community-driven platform for technical knowledge. Discussion attached to a doco is part of the record around that doco, and we treat it that way: we preserve as much of it as we reasonably can.

We will hide or redact content for a defined set of reasons, listed below. We will not hide content because someone disagrees with it, finds it incorrect, or dislikes the tone. Those are matters for replies, edits, or discussion, not for moderation.

## How to report content

If you are logged in, every discussion and reply has a report option. Choose a reason from the list, optionally add details, and submit.

You do not need to be a member of an organization or have any special role to file a report. Anyone with a docolin account can report any public content.

## Report reasons

Each reason describes what kind of content it covers and what we will typically do about it.

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

Reasons we will dismiss without further review:

- "I disagree with this." Reply to the discussion instead, or propose an edit.
- "This is factually wrong." Same. Correctness is for editing, not moderation.
- "I dislike the tone." We will look at edge cases, but tone alone is rarely actionable.
- "I regret saying that." Edit your comment or post a follow-up correction. Deletion-for-regret is not a moderation action we support.

## What happens after you report

Your report goes into a review queue. Most reports are seen first by the moderators of the doco where the content appears. Some categories (illegal content, threats, doxxing, leaked secrets, and a few others) are routed directly to platform staff because they are time-sensitive or require platform-level judgment.

You will be notified through your docolin inbox when your report is resolved, with the outcome and any notes the reviewer left.

If a report sits unresolved for a long time, or if dismissed content gets re-reported by other people, the report is automatically escalated for platform staff to look at directly.

## What happens to your reported content

There are two kinds of moderation actions we take.

**Hide.** The content is marked invisible to other readers. You, the author, can still see what you wrote, with a notice explaining it has been hidden and why. Doco moderators see that the content was hidden and the reason for it, but they do not see the content itself. Only platform staff can see hidden content's original body. This is a deliberate choice: the fewer people with ongoing access to harmful content, the better for everyone.

**Privacy redaction.** Used when the content itself contains data that should not exist in our database, like a real API key or someone else's personal information. A platform admin edits the comment to remove the specific content, and the original is **destroyed**. We do this for the same reason we hide other content from moderators: keeping an API key in an admin-visible audit log is still keeping an API key. The redaction is logged, but the redacted data itself is not.

In rare cases (court order, mandatory removal under law, GDPR right-to-erasure where no exception applies), we may **hard delete** content entirely. This is unusual and only done with platform staff approval.

## If your content is reported

You will receive an inbox notification when your content is reported. We do not tell you who reported it. We tell you what we did about it.

If your content is hidden or redacted, the notification includes the full reason given by the reporter or the reviewer. You can:

- See your own content with a "hidden" notice (no one else sees it)
- Reach out to platform staff if you believe the action was incorrect, or if you want to address the concern and have the hide reversed

Editing on its own does not reverse a hide. To restore visibility you have to address the underlying issue through support. You can still edit your own comments normally when they are not hidden; the edit history is preserved either way.

If your content was hidden under an embargo (e.g., a security vulnerability disclosed before a patch ships), the hide includes a target date. When the date passes, your content automatically becomes visible again and you receive a notification.

## Edit history

You can edit your own discussions and replies. We keep all prior versions in an edit history that anyone can view by clicking the "edited" indicator on a comment. This is intentional: the conversation around a doco often references things people said earlier, and erasing that breaks the record.

If you want to take something back, edit it and explain. Or post a follow-up correction. We do not provide a way to silently destroy your own past contributions.

## Reporter privacy

The person you reported never sees who reported them. They see what we did and why, not who flagged it.

You will see the outcome of your own reports through your inbox.

Reporters who file many reports that are dismissed may have their reports deprioritized. Reporters who file in bad faith (mass flagging, retaliatory reporting, coordinated harassment via the report system) may be restricted from reporting at all. We will tell you if this happens to you.

## Doco moderators

Each doco has moderators (typically the publisher and anyone they delegate to). Moderators can:

- Lock a discussion (no new replies, existing content remains visible)
- Pin a discussion to the top of a doco's discussion list
- Mark a discussion as resolved
- File deletion requests on content in their docos
- Dismiss reports they consider unwarranted

Moderators cannot:

- Directly hide content (only platform staff can, after a request)
- See hidden content (only platform staff can)
- Override decisions made by platform staff

The intent is to give moderators meaningful authority over their own communities while keeping ongoing access to potentially harmful content as narrow as possible.

## Platform staff

Platform staff (currently the docolin maintainers) handle:

- Reports auto-routed for urgency or legal sensitivity
- Reports escalated from doco moderators
- Privacy redactions and hard deletions
- Account suspensions and reinstatements
- DMCA and legal-process responses

All moderation actions, by both doco moderators and platform staff, are logged.

## Response times

docolin is currently maintained by a small team in their free time. We aim to respond as quickly as possible, especially to urgent harm. Routine reports may take longer. We will not pretend otherwise.

## Appeals

If you believe an action against your content was wrong, reach out to `support@docolin.com`. Platform staff will review the case. If a doco moderator made the original call, the review will be done by someone other than that moderator.

## DMCA, court orders, and other legal process

For copyright takedown requests (DMCA), court orders, subpoenas, regulator demands, GDPR Article 17 erasure requests, or any other legal process, contact `support@docolin.com`. Standard DMCA format applies for copyright claims.

We will not silently comply with legal demands that we believe are overbroad or improper. We will tell affected users when we are able to do so.

## License of this policy

This policy is part of the docolin platform documentation, licensed AGPL-3.0 along with the rest of the project. Forks and self-hosted instances of docolin may adopt this policy, modify it, or replace it as they see fit. The principles here are our suggested defaults; the law of the jurisdiction where each instance operates always takes precedence.

## Feedback on this policy

This policy will evolve. If you think it is missing something, weighted wrong, or unclear, open a discussion on this doco or file an issue against `github.com/docolin-dev/docolin`. The moderation policy is itself moderated by the community, not handed down.
