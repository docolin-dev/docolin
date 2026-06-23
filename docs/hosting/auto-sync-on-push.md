---
title: Auto-sync on push
description: Add a webhook so docolin re-syncs your docos the moment you push, instead of waiting for the daily poll. Works with GitHub and Codeberg.
authors:
  - handle: imgajeed

docolin:
  schema_version: 1
  kind: tools/docolin/hosting/auto-sync-on-push
  type: how-to

  applies_to:
    - github
    - codeberg

  language: en
  difficulty: intermediate
  time_estimate: 5m

  status: stable

  aliases:
    - webhook
    - auto-sync
    - instant sync
    - on-push sync
    - github webhook
    - codeberg webhook
---

# Auto-sync on push

By default docolin polls your repo about once a day, so a fresh commit shows up within a day (sooner if you hit **Refresh**). Auto-sync skips the wait: you add a **webhook** in your forge, and every push to your default branch tells docolin to sync right away, usually within seconds.

!!! info "In one line"
    Turn on auto-sync in your project settings, paste the URL and secret into your repo's webhook settings, and pushes sync the moment they land.

## Turn it on in docolin

1. Open your project's **Settings** page (the gear link on the project page).
2. Under **Auto-sync on push**, click **Enable auto-sync**.
3. docolin generates a **secret** and shows it once. Copy it now, along with the **Payload URL** just below it. The secret isn't shown again, so if you lose it, use **Regenerate secret** for a new one.

Keep that URL and secret handy for the next step. Then add the webhook in your forge.

## Add the webhook on GitHub

!!! steps
    1. In your GitHub repo, open **Settings → Webhooks → Add webhook**.
    2. Paste the **Payload URL** from docolin, and set **Content type** to `application/json`.
    3. Paste the **secret** into the **Secret** field.
    4. Leave **"Just the push event"** selected, then click **Add webhook**.

GitHub sends a test ping right away, which docolin acknowledges without syncing. GitHub's **Recent Deliveries** list shows a green check when the URL and secret are right; **Last push received** in docolin fills in once you actually push to your default branch.

## Add the webhook on Codeberg

!!! steps
    1. In your Codeberg repo, open **Settings → Webhooks → Add webhook → Forgejo**.
    2. Paste the **Payload URL** from docolin as the **Target URL**.
    3. Paste the **secret** into the **Secret** field.
    4. Set the trigger to **Push Events**, then click **Add webhook**.

Use Codeberg's **Test Delivery** button to send a sample push and confirm it arrives.

## Check that it works

Push any commit to your default branch. Within a few seconds the project page's sync badge should switch to syncing, then back to synced, and **Last push received** in settings updates to just now. If a sync has real work to do, it runs in the background and the badge shows progress.

!!! note "Only your default branch syncs"
    docolin syncs the branch your project is configured to read (your default branch). Pushes to other branches are received and acknowledged, but don't trigger a sync.

## If it doesn't fire

- **404 from the webhook** means auto-sync isn't enabled for that project (or was turned off). Re-enable it in settings and re-copy the URL.
- **401 (bad signature)** means the secret in your forge doesn't match docolin's. Regenerate the secret in docolin and paste the new one into the forge.
- Forges **retry** failed deliveries on their own, and the daily poll plus **Refresh** are always there as a fallback, so a missed webhook never leaves you stuck.

Auto-sync is a convenience on top of polling, not a replacement: if you ever turn it off, docolin keeps your docos current the usual way.
