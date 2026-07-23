// Minimal authenticated proxy for the Slack example (node >= 18, no deps):
//   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... \
//   FEEDBACK_TOKEN=some-shared-secret node server.example.mjs
// The webhook URL is a reusable credential — it lives HERE, never in HTML.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const TOKEN = process.env.FEEDBACK_TOKEN; // optional shared secret for public deploys
if (!WEBHOOK) throw new Error('SLACK_WEBHOOK_URL is required');

const hits = new Map(); // naive per-IP rate limit: 10 submissions / 10 min
const allow = (ip) => {
  const now = Date.now();
  const windowStart = now - 10 * 60_000;
  const list = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  list.push(now);
  hits.set(ip, list);
  return list.length <= 10;
};

createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.setHeader('content-type', 'text/html');
    return res.end(await readFile(new URL('./index.html', import.meta.url)));
  }
  if (req.method !== 'POST' || req.url !== '/api/feedback') {
    res.statusCode = 404;
    return res.end();
  }
  if (TOKEN && req.headers['x-feedback-token'] !== TOKEN) {
    res.statusCode = 401;
    return res.end();
  }
  if (!allow(req.socket.remoteAddress ?? '?')) {
    res.statusCode = 429;
    return res.end();
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64_000) {
      res.statusCode = 413; // a feedback payload is small; anything huge is abuse
      return res.end();
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.statusCode = 400;
    return res.end();
  }
  const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks.slice(0, 40) : [];
  const reviewer = String(parsed?.reviewer ?? 'reviewer').slice(0, 80);
  const upstream = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `Pinflow feedback from ${reviewer}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `Feedback from ${reviewer}` } },
        ...blocks,
      ],
    }),
  });
  res.statusCode = upstream.ok ? 200 : 502;
  res.end();
}).listen(8787, () => console.log('feedback proxy on :8787'));
