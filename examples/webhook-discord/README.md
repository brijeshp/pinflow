# Pinflow → Discord

Posts each export to a Discord channel — with the webhook URL kept **server-side**.

A Discord webhook URL is a REUSABLE CREDENTIAL: anyone who has it can
post to your channel forever. Never place it in browser-delivered HTML.

## Run

1. Create a webhook in your Discord channel settings (Integrations → Webhooks).
2. Start the proxy (node >= 18, no dependencies):

   ```bash
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
   FEEDBACK_TOKEN=pick-a-shared-secret node server.example.mjs
   ```

   `FEEDBACK_TOKEN` is REQUIRED. The proxy authenticates with it, rate-limits
   per IP, and caps payload size before forwarding to Discord.

3. Open http://localhost:8787 and set the matching token in `index.html`
   (`x-feedback-token` header).

For anything beyond a demo, replace the shared secret with your real auth.
