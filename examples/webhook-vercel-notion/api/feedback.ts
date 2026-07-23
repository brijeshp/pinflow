// Deploy this as a Vercel Serverless Function.
// Set NOTION_API_KEY and NOTION_DATABASE_ID as environment variables.

interface Comment {
  text: string;
  route: string;
  anchor: {
    textFingerprint: string;
    selectors: { testid: string | null; css: string };
  };
}

interface Payload {
  reviewer: string;
  project: string;
  comments: Comment[];
}

// Naive per-IP rate limit (per warm lambda): 5 submissions / 10 minutes.
// Enough to stop drive-by abuse of a demo deploy; use a real limiter for
// anything serious.
const hits = new Map<string, number[]>();
function allow(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => t > now - 10 * 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length <= 5;
}

export default async function handler(
  req: {
    method: string;
    body: Payload;
    headers: Record<string, string | string[] | undefined>;
  },
  res: { status: (n: number) => { json: (o: unknown) => void } },
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const notionKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_DATABASE_ID;
  // REQUIRED shared secret: this endpoint performs privileged Notion writes,
  // so it must not be publicly writable. Send the same value from the page as
  // an `x-feedback-token` header (codex audit #16).
  const token = process.env.FEEDBACK_TOKEN;

  if (!notionKey || !dbId || !token) {
    return res.status(500).json({ error: 'Missing NOTION_* or FEEDBACK_TOKEN env' });
  }
  if (req.headers['x-feedback-token'] !== token) {
    return res.status(401).json({ error: 'Bad token' });
  }
  const ip = String(req.headers['x-forwarded-for'] ?? '?').split(',')[0]!;
  if (!allow(ip)) {
    return res.status(429).json({ error: 'Rate limited' });
  }

  const { reviewer, project, comments } = req.body ?? ({} as Payload);
  // Schema + size bounds: a feedback batch is small; anything else is abuse.
  if (
    typeof reviewer !== 'string' ||
    typeof project !== 'string' ||
    !Array.isArray(comments) ||
    comments.length === 0 ||
    comments.length > 100
  ) {
    return res.status(400).json({ error: 'Bad payload' });
  }

  const results = [];
  for (const c of comments.slice(0, 100)) {
    if (typeof c?.text !== 'string' || typeof c?.route !== 'string') continue;
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          Name: { title: [{ text: { content: c.text.slice(0, 100) } }] },
          Reviewer: { rich_text: [{ text: { content: reviewer } }] },
          Project: { rich_text: [{ text: { content: project } }] },
          Route: { rich_text: [{ text: { content: c.route } }] },
          Element: {
            rich_text: [{ text: { content: c.anchor.textFingerprint || c.anchor.selectors.css } }],
          },
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: c.text } }] },
          },
        ],
      }),
    });
    results.push({ status: response.status });
  }

  // Upstream failures surface instead of vanishing into a blanket 200
  // (codex audit #16): the client can tell the reviewer their feedback did
  // not all land.
  const failed = results.filter((r) => r.status >= 400).length;
  if (failed > 0) {
    return res.status(502).json({ ok: false, created: results.length - failed, failed });
  }
  return res.status(200).json({ ok: true, created: results.length });
}
