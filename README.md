# Pinflow

Figma-style pin-and-comment annotation for any prototype. Zero backend. One line to install. Exports to markdown that drops straight into Claude Code or Cursor.

```html
<script src="https://cdn.jsdelivr.net/npm/pinflow@latest" data-project="my-prototype"></script>
```

[Live demo](https://pinflow.dev) · [Spec](./specs/pinflow_v1_spec.md) · [Examples](./examples) · MIT

---

![Demo GIF placeholder — recording in progress](./docs/demo.gif)

## Install

**Vanilla / script tag** (default):

```html
<script src="https://cdn.jsdelivr.net/npm/pinflow@latest" data-project="my-prototype"></script>
```

**React:**

```bash
npm install pinflow
```

```jsx
import { Annotator } from 'pinflow/react';

export default function App() {
  return (
    <>
      <Annotator project="my-prototype" />
      {/* rest of your app */}
    </>
  );
}
```

**Vue:**

```js
import { Annotator } from 'pinflow/vue';
```

**Next.js:** use inside a `'use client'` wrapper — see [`examples/nextjs`](./examples/nextjs).

## How it works

1. **Builder** ships a prototype (Lovable, Bolt, Replit, Vercel preview — anything).
2. **Reviewer** opens the URL. Identity comes from `?reviewer=NAME` or a one-time prompt.
3. Reviewer clicks any element to drop a pin, types a comment, hits Save. Stored in localStorage.
4. Reviewer hits "Export & share" → downloads a markdown file.
5. Builder pastes the markdown into Claude Code as the next prompt.

No accounts, no servers, no auth. Ever.

## Configuration

```js
window.Pinflow.init({
  project: 'my-prototype', // localStorage namespace
  reviewer: 'Sarah', // override URL param
  mode: 'reviewer', // 'reviewer' | 'builder'
  theme: {
    // Optional design tokens so the widget matches your product.
    // All optional; omit the object entirely for the stock look.
    fontFamily: 'DM Sans',
    accent: '#2d8b8b', // buttons, pins, active states
    accentContrast: '#f1faee', // text on accent surfaces
    surface: '#ffffff', // panel/popup background
    text: '#1a2332',
    textMuted: '#4a5568',
    danger: '#e07a5f', // delete + recording indicator
    radius: '14px',
    shadow: '0 4px 20px rgba(26,35,50,0.1)',
  },
  onChange: (store, change) => {
    // Optional: live ingestion — fires after every persisted add/update/delete.
    // You own debouncing/batching; exceptions are caught and logged.
    void fetch('/api/feedback-events', { method: 'POST', body: JSON.stringify(change) });
  },
  onSubmit: async (payload) => {
    // Optional: POST the full store to your own endpoint on explicit submit
    await fetch('/api/feedback', { method: 'POST', body: JSON.stringify(payload) });
  },
});
```

See [`specs/pinflow_v1_spec.md`](./specs/pinflow_v1_spec.md) for the full API.

## Sync

localStorage is the zero-config default. To make feedback durable — and to close the loop with team dispositions rendered on the reviewer's own pins — pair `source` (read: hydrate comments from your backend at init) with `onChange` (write: upsert/delete by comment id). The full contract, including merge semantics and the server-owned `status`/`resolution` fields, is three verbs documented in [`PROTOCOL.md`](./PROTOCOL.md).

## Builder mode

Open your prototype URL with `?mode=builder` to see all comments from every reviewer whose comments are in this browser's localStorage. Hit "Export all" to download an aggregated markdown file.

Treat the builder URL as a soft secret — there is no auth on this mode.

## Markdown export

The export format is the load-bearing feature. It is designed for direct paste into an AI coding tool. A sample:

```markdown
# Feedback for my-prototype — from Sarah

Generated: 2026-04-15T14:45:00Z
Reviewer: Sarah
Total comments: 2
Routes covered: /, /pricing

---

## Route: /

### Comment 1 — 2026-04-15T14:24:00Z

**Element:** `<button data-testid="primary-cta">` ("Get started for free")
**Selector candidates:**

- testid: `primary-cta`
- css: `main > section:nth-of-type(1) > button.cta-primary`
- xpath: `/html/body/main/section[1]/button[1]`
  **Position:** 47% from left, 38% from top of element
  **Viewport at time of comment:** 390×844 (mobile)

> This CTA gets lost against the background.
```

See [`specs/pinflow_v1_spec.md` §7](./specs/pinflow_v1_spec.md#7-markdown-export-specification) for the exact format.

## Privacy

- All comments live in the reviewer's browser localStorage.
- No telemetry. Ever.
- No network calls unless you configure `onSubmit`.
- Element text content is captured as a fingerprint — be aware of this when deploying on prototypes containing sensitive data.
- Each pin also captures the nearest heading's text (plus the target's accessible name and role) as element context for exports — the same caution applies.

## Examples

- [`vanilla-html`](./examples/vanilla-html) — single script tag
- [`react-vite`](./examples/react-vite) — React + Vite
- [`nextjs`](./examples/nextjs) — Next.js App Router
- [`lovable-prototype`](./examples/lovable-prototype) — Lovable / Bolt output
- [`webhook-discord`](./examples/webhook-discord) — post to Discord
- [`webhook-slack`](./examples/webhook-slack) — post to Slack
- [`webhook-vercel-notion`](./examples/webhook-vercel-notion) — Vercel function → Notion

## Browser and framework support

Last 2 versions of Chrome, Safari, Firefox, Edge. Mobile Safari and Chrome Android. Vanilla JS, React 18+, Vue 3+. Works out of the box with Next.js, Remix, Vite, Astro, Lovable, and Bolt.

Iframes are not annotated in v1.

## Deliberately deferred

Threading, @mentions, status, severity, assignees, voice notes, sketching, real-time collaboration, screenshot capture, AI reviewers, issue-tracker integrations, auth, servers. See [spec §3](./specs/pinflow_v1_spec.md#3-scope) and [§12](./specs/pinflow_v1_spec.md#12-deferred-to-v2-and-beyond).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). TL;DR: zero runtime deps, hard size budgets enforced by `pnpm size` (`size-limit` in `package.json`), UI layer stays in Shadow DOM.

## License

MIT
