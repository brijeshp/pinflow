// Minimal authenticated proxy for the Discord example (node >= 18, no deps):
//   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
//   FEEDBACK_TOKEN=some-shared-secret node server.example.mjs
// The webhook URL is a reusable credential — it lives HERE, never in HTML.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const TOKEN = process.env.FEEDBACK_TOKEN;
if (!WEBHOOK || !TOKEN) throw new Error('FEEDBACK_TOKEN and DISCORD_WEBHOOK_URL is required');

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
  if (req.headers['x-feedback-token'] !== TOKEN) {
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
  const content = String(parsed?.content ?? '').slice(0, 1900); // Discord cap is 2000
  if (!content) {
    res.statusCode = 400;
    return res.end();
  }
  const upstream = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  res.statusCode = upstream.ok ? 200 : 502;
  res.end();
}).listen(8787, () => console.log('feedback proxy on :8787'));
