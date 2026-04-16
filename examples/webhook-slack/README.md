# Slack Webhook Example

Posts reviewer feedback to a Slack channel using an incoming webhook.

## Setup

1. Create an incoming webhook in your Slack workspace settings.
2. Replace `SLACK_WEBHOOK_URL` in `index.html`.
3. Serve and share `?reviewer=NAME` links.

## How it works

The `onSubmit` callback sends a Slack Block Kit message with each comment as a section block. Uses the standard Slack incoming webhook format.
