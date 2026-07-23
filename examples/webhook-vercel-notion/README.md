# Vercel + Notion Example

Writes each comment as a page in a Notion database via a Vercel serverless function.

## Setup

1. Create a Notion integration at https://www.notion.so/my-integrations.
2. Create a Notion database with properties: `Name` (title), `Reviewer` (text), `Project` (text), `Route` (text), `Element` (text).
3. Share the database with your integration.
4. Deploy to Vercel with these env vars:
   - `NOTION_API_KEY` — your integration token
   - `NOTION_DATABASE_ID` — the database ID from the URL
   - `ALLOWED_ORIGIN` — the exact origin your page is served from (e.g.
     `https://your-app.vercel.app`). The endpoint refuses other origins; this
     limits drive-by abuse from arbitrary sites but is NOT authentication —
     put the endpoint behind real auth for production use.

```bash
vercel deploy
```

5. Open the deployed URL with `?reviewer=NAME` and leave comments.

## How it works

The `onSubmit` callback POSTs the comment payload to `/api/feedback`, which is a Vercel serverless function that creates a Notion page per comment using the Notion API.

## Local development

For local testing without Vercel, you can mock the API endpoint or use `vercel dev`.
