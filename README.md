# Pinflow

Figma-style pin-and-comment annotation for any prototype — and the feedback lifecycle around it. Zero backend by default, bring-your-own-backend by contract. Exports to markdown that drops straight into Claude Code or Cursor.

```html
<script
  src="https://cdn.jsdelivr.net/npm/@brijeshp/pinflow@latest"
  data-project="my-prototype"
  onerror="console.error('pinflow failed to load')"
></script>
```

On success pinflow prints one boot line to the console (`[pinflow] vX ready — …`); if you see neither that nor the onerror message, the script never ran.

[Live demo](https://pinflow.dev) · [Spec](./specs/pinflow_v1_spec.md) · [Sync protocol](./PROTOCOL.md) · [Examples](./examples) · MIT

---

## The lifecycle

Pinflow covers the whole loop, not just the pin:

- **Capture** — reviewers pin any element and comment by text or voice (`voice: { tokenEndpoint }`); the visible button, Alt+click (⌥-click on Mac), and a 500 ms long-press on touch all work out of the box; `activation: { mode: 'stealth' }` hides the button for gesture-only, `'toggle'` is button-only.
- **Export** — one action collates everything into markdown or JSON (`handle.exportMarkdown()` / `exportJSON()`), each comment carrying its stable id, a friendly frame heading (`describeRoute`), and element context — "the 'Continue' button under 'Next section'", not just a CSS path.
- **Submit** — with `submitTo: { email }`, the post-export confirmation opens a prefilled `mailto:` while the artifact is already downloaded and on the clipboard: a complete zero-backend hand-off.
- **Sync** — pair `source` (read) with `onChange` (write) and any backend that implements three verbs becomes durable storage; the whole contract is [`PROTOCOL.md`](./PROTOCOL.md).
- **Resolve** — the team sets `status`/`resolution` on their side; the reviewer's own pins render the disposition in situ — muted ✓ for done, struck for declined, the note shown read-only in the popup.

## Install

**Vanilla / script tag** (default):

```html
<script
  src="https://cdn.jsdelivr.net/npm/@brijeshp/pinflow@latest"
  data-project="my-prototype"
  onerror="console.error('pinflow failed to load')"
></script>
```

On success pinflow prints one boot line to the console (`[pinflow] vX ready — …`); if you see neither that nor the onerror message, the script never ran.

**React:**

```bash
npm install @brijeshp/pinflow
```

```jsx
import { Annotator } from '@brijeshp/pinflow/react';

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
import { Annotator } from '@brijeshp/pinflow/vue';
```

**Next.js:** use inside a `'use client'` wrapper — see [`examples/nextjs`](./examples/nextjs).

## How it works

1. **Builder** ships a prototype (Lovable, Bolt, Replit, Vercel preview — anything).
2. **Reviewer** opens the URL. Identity comes from `?reviewer=NAME` or a one-time prompt.
3. Reviewer clicks any element to drop a pin, types a comment, hits Save. Stored in localStorage.
4. Reviewer hits "Export & share" → the markdown downloads and lands on the clipboard; with `submitTo` configured, one more click opens a prefilled email to the builder.
5. Builder pastes the markdown into Claude Code as the next prompt.

With a synced backend ([`PROTOCOL.md`](./PROTOCOL.md)), the loop closes:

6. Builder marks comments done or declined — with a one-line note — through their own backend.
7. Reviewer's next visit hydrates via `source`: their pins render resolved (✓ / struck), frozen, note visible.

No accounts, no servers, no auth. Ever — pinflow ships contracts and hooks, never a backend.

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

  // Lifecycle (all optional; see PROTOCOL.md for the sync contract)
  routeKey: () => app.currentStep, // logical screen key when screens change without a URL change
  describeRoute: (key) => stepLabels[key] ?? '', // friendly frame headings in exports
  submitTo: { email: 'builder@example.com' }, // "Email it to the builder" after export
  source: async () => {
    // Read half of sync: hydrate this reviewer's comments (with team-set
    // status/resolution) once at init. Failures fall back to localStorage.
    const res = await fetch('/api/feedback-annotations');
    return res.json();
  },
  onChange: (store, change) => {
    // Write half of sync — fires after every persisted add/update/delete.
    // You own debouncing/batching; exceptions are caught and logged.
    void fetch('/api/feedback-events', { method: 'POST', body: JSON.stringify(change) });
  },
  onSubmit: async (payload) => {
    // Optional: POST the full store to your own endpoint on explicit submit
    await fetch('/api/feedback', { method: 'POST', body: JSON.stringify(payload) });
  },
});
```

The full, current API surface lives in [`docs/wiki/api.md`](./docs/wiki/api.md) (agent-maintained, drift-checked in CI); [`specs/pinflow_v1_spec.md`](./specs/pinflow_v1_spec.md) is the original v1 spec and predates voice, the lifecycle, and anytime export.

## Sync

localStorage is the zero-config default. To make feedback durable — and to close the loop with team dispositions rendered on the reviewer's own pins — pair `source` (read: hydrate comments from your backend at init) with `onChange` (write: upsert/delete by comment id). The full contract, including merge semantics and the server-owned `status`/`resolution` fields, is three verbs documented in [`PROTOCOL.md`](./PROTOCOL.md).

## Builder mode

Open your prototype URL with `?mode=builder` to see all comments from every reviewer whose comments are in this browser's localStorage. Hit "Export all" to download an aggregated markdown file.

Treat the builder URL as a soft secret — there is no auth on this mode.

## Markdown export

The export format is the load-bearing feature. It is designed for direct paste into an AI coding tool — and, with ids and dispositions, doubles as the team-side tracking artifact.

Export is available at any moment, not just at the end. Once the reviewer has a comment, a small count chip (the pins' own visual vocabulary, bottom-left) summons an export sheet; the draft popup carries an `Export all · n` action that saves your comment first; and `⌘/Ctrl+Shift+E` opens the same sheet on desktop. All three ride the standard flow: download + clipboard + the `submitTo` hand-off when configured.

This is governed by `exportUi: 'auto' | 'always' | 'never'` (default `'auto'`): on for local-first installs, off automatically when `source` is configured — a synced host owns collation, so member-side export there would be noise. A sample artifact:

```markdown
# Feedback for my-prototype — from Sarah

Generated: 2026-04-15T14:45:00Z
Reviewer: Sarah
Total comments: 2
Routes covered: /, /pricing

---

## Route: /

### [cmt_9f2kx1abq] Comment 1 — 2026-04-15T14:24:00Z — done

**Element:** `<button data-testid="primary-cta">` ("Get started for free")
**Context:** the ‘Get started for free’ button under ‘Ship faster’
**Selector candidates:**

- testid: `primary-cta`
- css: `main > section:nth-of-type(1) > button.cta-primary`
- xpath: `/html/body/main/section[1]/button[1]`
  **Position:** 47% from left, 38% from top of element
  **Viewport at time of comment:** 390×844 (mobile)

> This CTA gets lost against the background.
```

The `— done` suffix appears only when the team has set a disposition, so backendless exports stay noise-free. `exportJSON()` emits the same corpus machine-readably (`{ pinflowExport: 3, comments: [...] }`); both generators are pure and DOM-free, so hosts run them server-side too. See [`specs/pinflow_v1_spec.md` §7](./specs/pinflow_v1_spec.md#7-markdown-export-specification) for the base format.

## Production case study

[Sensavera](https://sensavera.com), a voice research platform, runs pinflow in production embedded in a phased single-URL experience: `routeKey` scopes pins to each frame of the flow, `onChange`/`source` stream every annotation to its backend live (the named reference implementation in [`PROTOCOL.md`](./PROTOCOL.md)), and the theme tokens restyle the whole widget — voice HUD included — to its design system.

## Privacy

- All comments live in the reviewer's browser localStorage.
- No telemetry. Ever.
- No network calls unless you configure them: `onSubmit`, `onChange`, `source`, or voice transcription (`voice.tokenEndpoint`).
- Element text content is captured as a fingerprint — be aware of this when deploying on prototypes containing sensitive data.
- Each pin also captures the nearest heading's text (plus the target's accessible name and role), a small computed-style snapshot (background/color/font/radius), and image URLs — both `<img src>` for image pins and CSS `background-image` URLs, which may include signed/tokenized CDN links — as element context so agents know what is pinned. The same caution applies.

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

Threading, @mentions, severity, assignees, sketching, real-time collaboration, screenshot capture, AI reviewers, issue-tracker integrations, auth, servers. See [spec §3](./specs/pinflow_v1_spec.md#3-scope) and [§12](./specs/pinflow_v1_spec.md#12-deferred-to-v2-and-beyond).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). TL;DR: zero runtime deps, hard size budgets enforced by `pnpm size` (`size-limit` in `package.json`), UI layer stays in Shadow DOM.

## License

MIT
