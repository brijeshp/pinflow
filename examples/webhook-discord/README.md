# Discord Webhook Example

Posts reviewer feedback to a Discord channel when the reviewer taps "Send to builder".

## Setup

1. Create a Discord webhook in your channel settings.
2. Replace `DISCORD_WEBHOOK_URL` in `index.html` with your webhook URL.
3. Serve the page and share `?reviewer=NAME` links.

## How it works

The `onSubmit` callback formats comments into a Discord message and POSTs to the webhook. This runs alongside the standard "Export & share" flow — reviewers can use either or both.
