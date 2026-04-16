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

export default async function handler(req: { method: string; body: Payload }, res: { status: (n: number) => { json: (o: unknown) => void } }) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reviewer, project, comments } = req.body;
  const notionKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_DATABASE_ID;

  if (!notionKey || !dbId) {
    return res.status(500).json({ error: 'Missing Notion credentials' });
  }

  const results = [];
  for (const c of comments) {
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
          Element: { rich_text: [{ text: { content: c.anchor.textFingerprint || c.anchor.selectors.css } }] },
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

  return res.status(200).json({ ok: true, created: results.length });
}
