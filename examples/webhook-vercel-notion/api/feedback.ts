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
  // HONEST LIMITS OF A PUBLIC DEMO: a secret shipped in public HTML cannot
  // authenticate anything, so this endpoint gates on an ORIGIN allowlist +
  // rate limit + size caps instead. That stops drive-by abuse from other
  // sites; a determined attacker can still spoof Origin outside a browser.
  // For real use, put this behind actual auth (session, signed link) —
  // pinflow's PROTOCOL.md assumes the host owns authentication.
  const allowedOrigin = process.env.ALLOWED_ORIGIN;

  if (!notionKey || !dbId || !allowedOrigin) {
    return res.status(500).json({ error: 'Missing NOTION_* or ALLOWED_ORIGIN env' });
  }
  const origin = String(req.headers['origin'] ?? '');
  if (origin !== allowedOrigin) {
    return res.status(403).json({ error: 'Bad origin' });
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
    if (
      typeof c?.text !== 'string' ||
      typeof c?.route !== 'string' ||
      typeof c?.anchor?.selectors?.css !== 'string'
    )
      continue; // unvalidated anchors must not reach the Notion payload
    let response: { status: number };
    try {
      response = await fetch('https://api.notion.com/v1/pages', {
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
              rich_text: [
                { text: { content: c.anchor.textFingerprint || c.anchor.selectors.css } },
              ],
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
    } catch {
      response = { status: 502 }; // network failure to Notion — surfaced below
    }
    results.push({ status: response.status });
  }

  // Upstream failures surface instead of vanishing into a blanket 200
  // (review #16): the client can tell the reviewer their feedback did
  // not all land.
  const failed = results.filter((r) => r.status >= 400).length;
  if (failed > 0) {
    return res.status(502).json({ ok: false, created: results.length - failed, failed });
  }
  return res.status(200).json({ ok: true, created: results.length });
}
