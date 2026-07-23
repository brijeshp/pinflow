# Pinflow → Slack

Posts each export to a Slack channel — with the webhook URL kept **server-side**.

A Slack incoming-webhook URL is a REUSABLE CREDENTIAL: anyone who has it can
post to your channel forever. Never place it in browser-delivered HTML.

## Run

1. Create an incoming webhook in Slack (Apps → Incoming Webhooks).
2. Start the proxy (node >= 18, no dependencies):

   ```bash
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... \
   FEEDBACK_TOKEN=pick-a-shared-secret node server.example.mjs
   ```

   `FEEDBACK_TOKEN` is REQUIRED. The proxy authenticates with it, rate-limits
   per IP, and caps payload size before forwarding to Slack.

3. Open http://localhost:8787 and set the matching token in `index.html`
   (`x-feedback-token` header).

For anything beyond a demo, replace the shared secret with your real auth.
