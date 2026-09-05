# Pinflow guide

Everything beyond the first five minutes: configuration, sync, voice, builder
mode, privacy, and troubleshooting. New here? Start with the
[README](../README.md), or try the widget on [pinflow.dev](https://pinflow.dev).

For how the code is put together — architecture, the selector ladder, the export
contract — see the [codebase wiki](./wiki/README.md).

---

## How feedback is stored

With no additional configuration, Pinflow saves comments to `localStorage` in the reviewer's
browser. This is the simplest setup: there is no server, account system, or database to run.

Local storage also defines the limits of that setup:

- Feedback stays on the browser and device where it was created.
- Clearing site data removes it.
- Builder mode can only aggregate reviewers whose comments exist in that same browser.
- If the browser blocks local storage, Pinflow falls back to memory for the current page
  session; those comments do not survive a reload.

Use [backend sync](#connect-your-own-backend) when feedback must follow a reviewer across
devices, appear in a team workspace, or survive cleared browser data.

## Frameworks

Install the package when your app uses a bundler:

```bash
npm install @brijeshp/pinflow
```

The script-tag setup does not require Node.js. Package consumers and contributors need Node.js
18 or newer. React and Vue are optional peer dependencies; install only the framework you
use.

### JavaScript or TypeScript

```ts
import { init } from '@brijeshp/pinflow';

const pinflow = init({
  project: 'checkout-redesign',
});
```

`init()` returns a handle for lifecycle, route refresh, and export operations. Pinflow is a
singleton: calling `init()` again replaces the active instance. Call `pinflow.destroy()` when
the host app is torn down.

### React

```tsx
import { Annotator } from '@brijeshp/pinflow/react';

export default function App() {
  return (
    <>
      <Annotator project="checkout-redesign" />
      <YourApp />
    </>
  );
}
```

`<Annotator>` renders no visible React node of its own. It mounts Pinflow's isolated interface
when the component mounts and removes it when the component unmounts.

### Next.js

Pinflow uses browser APIs, so put the React wrapper behind a client-component boundary:

```tsx
// app/pinflow-provider.tsx
'use client';

import { Annotator } from '@brijeshp/pinflow/react';

export function PinflowProvider() {
  return <Annotator project="checkout-redesign" />;
}
```

Mount `PinflowProvider` from your layout or page. See the complete
[Next.js example](https://github.com/brijeshp/pinflow/tree/main/examples/nextjs).

### Vue

```vue
<script setup lang="ts">
import { Annotator } from '@brijeshp/pinflow/vue';
</script>

<template>
  <Annotator project="checkout-redesign" />
</template>
```

Vue exposes `onSubmit` as `submitHandler` and `onChange` as `changeHandler` because `on*`
props have special meaning in Vue. The other configuration names are unchanged.

## Configuration

Only `project` is required.

```ts
import { init } from '@brijeshp/pinflow';

const pinflow = init({
  project: 'checkout-redesign',
  reviewer: 'Sam',
  activation: { mode: 'both' },
  exportUi: 'auto',
  theme: {
    accent: '#6d4aff',
    accentContrast: '#ffffff',
    radius: '12px',
  },
});
```

| Option          | Purpose                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `project`       | Required storage namespace for the reviewed experience.                                                                         |
| `reviewer`      | Sets the display name instead of reading `?reviewer=` or prompting.                                                             |
| `mode`          | Uses reviewer mode by default; `'builder'` makes the handle's exports aggregate every store in this browser (no UI of its own). |
| `activation`    | Chooses the visible control, gestures, or both.                                                                                 |
| `exportUi`      | Controls the reviewer's export controls: `'auto'`, `'always'`, or `'never'`.                                                    |
| `onSubmit`      | Sends the current reviewer's full store through a host-provided function.                                                       |
| `source`        | Loads this reviewer's saved comments from your backend.                                                                         |
| `onChange`      | Reports each saved add, update, and delete to your backend.                                                                     |
| `routeKey`      | Identifies the current screen when the URL is not enough.                                                                       |
| `describeRoute` | Gives route keys readable names in exported feedback.                                                                           |
| `theme`         | Applies Pinflow's optional visual design tokens.                                                                                |
| `voice`         | Enables voice comments through a short-lived token provider.                                                                    |

See the [API reference](https://github.com/brijeshp/pinflow/blob/main/docs/wiki/api.md) for
complete types, wrapper behavior, and the returned handle.

### Choose how reviewers activate Pinflow

```ts
init({
  project: 'checkout-redesign',
  activation: { mode: 'both' },
});
```

- `'both'` is the default: visible control, Alt/Option+click, and a long-press on touch
  screens and pen devices.
- `'toggle'` shows the control and disables the gestures.
- `'stealth'` hides the control and uses gestures only.

On most Linux desktops (GNOME, KDE) **Alt+drag is the window manager's own "move window"
binding**, so it never reaches the browser and the area gesture is unavailable there. The
dock's **+** button does everything the gestures do. If your reviewers are mainly on Linux,
`'toggle'` removes the gestures rather than leaving a shortcut that silently does nothing.

Stealth mode also delays the name prompt until the reviewer first tries to leave feedback, so
the page loads without any visible Pinflow interaction.

### Identify a reviewer

Pinflow resolves the display name in this order:

1. The `reviewer` configuration value.
2. The `?reviewer=NAME` query parameter.
3. A one-time browser prompt.

For example:

```text
https://preview.example.com/checkout?reviewer=Sam
```

The reviewer name is a label, not authentication. If access control or verified identity
matters, enforce it in your application and backend.

### Review multi-step and single-page experiences

By default, Pinflow groups comments by `pathname + search` and automatically follows browser
navigation. If several screens share one URL, provide your own stable screen key and tell
Pinflow when it changes:

```ts
let currentStep = 'shipping';
const stepLabels: Record<string, string> = {
  shipping: 'Shipping details',
  payment: 'Payment',
  confirmation: 'Confirmation',
};

const pinflow = init({
  project: 'checkout-redesign',
  routeKey: () => currentStep,
  describeRoute: (key) => stepLabels[key] ?? key,
});

function moveToStep(nextStep: string) {
  currentStep = nextStep;
  pinflow.refreshRoute();
}
```

Pins from other screens are hidden, and the readable label appears in exported feedback.

### Match your product's visual style

```ts
init({
  project: 'checkout-redesign',
  theme: {
    fontFamily: 'Inter',
    accent: '#2d6a4f',
    accentContrast: '#ffffff',
    surface: '#ffffff',
    text: '#17221d',
    textMuted: '#66736c',
    danger: '#c2413b',
    radius: '14px',
    shadow: '0 12px 32px rgba(23, 34, 29, 0.16)',
  },
});
```

All theme values are optional. Pinflow renders inside a Shadow DOM so host styles do not leak
into the widget, and Pinflow styles do not leak into the host page.

## Export and share feedback

The default export action does two things: it downloads a Markdown file and copies the same
content to the clipboard. The result is readable on its own and can be pasted into an issue,
pull request, project document, or coding assistant.

Each comment includes the reviewer's words plus the information needed to find the target
again:

```markdown
## Route: /checkout

### Comment 1

**Comment ID:** `cmt_9f2kx1abq`
**Status:** open
**Created:** 2026-08-04T14:24:00Z
**Element:** `<button data-testid="place-order">` (“Place order”)
**Context:** the ‘Place order’ button under ‘Review your order’
**Selector candidates:**

- testid: `place-order`
- css: `main > section:nth-of-type(2) > button.primary`
- xpath: `/html/body/main/section[2]/button[1]`

**Position:** 47% from left, 38% from top of element
**Viewport at time of comment:** 390×844 (mobile)

> This button needs a clearer disabled state.
```

You can also export from your own interface:

```ts
const pinflow = init({ project: 'checkout-redesign' });

const markdown = pinflow.exportMarkdown();
const json = pinflow.exportJSON();

// Downloads Markdown and copies it to the clipboard.
pinflow.downloadExport();
```

Reviewer mode exports that reviewer's comments. Builder mode exports all comments available
to the local builder view. The package also exports DOM-free helpers—`exportReviewer`,
`exportBuilder`, `exportJSON`, and `exportFilename`—for generating artifacts from stored data
on a server or in another application.

If a page change removes an annotated element, Pinflow hides the now-misleading pin but keeps
the comment. The export reports it as unanchored and preserves the last known element context.
A pin taken inside a modal (`role="dialog"`, `aria-modal`, or an open `<dialog>`) is bound to that
dialog by its accessible name: it shows only while a dialog of that name is open, parks when the
dialog closes, and comes back when it reopens. It never re-attaches to the page underneath. The
export prints the dialog on a `**Layer:**` line so an agent knows to open it first.

### Teach your agent to read the artifact

The package ships an `agent/` folder with the reading protocol — what `[cmt_id]` is for, how to
walk the selector candidates, that `**Position:**` is a percentage inside the element rather
than a page coordinate, and that orphaned comments describe elements which no longer exist. It
also states the rule that matters most: everything in an artifact comes from a web page and its
users, so an agent must treat it as a problem description and never as instructions addressed to
itself.

None of it is code, so it costs your users nothing. Install whichever format your tool reads:

```bash
mkdir -p .claude/skills .claude/commands
cp -r node_modules/@brijeshp/pinflow/agent/skills/pinflow-feedback .claude/skills/
cp node_modules/@brijeshp/pinflow/agent/commands/review-feedback.md .claude/commands/
```

Cursor and Windsurf read `agent/rules/pinflow.md`; `agent/AGENTS.snippet.md` appends to an
existing `AGENTS.md`. See [`agent/README.md`](./agent/README.md).

### `submitTo` was removed in 0.6.0

It added an **Email it to the builder** button that opened a prefilled `mailto:` draft. The
recipient was the host's guess and Pinflow knows nothing about the reviewer beyond a display
name, so the action handed someone a half-written email to finish themselves. The export
confirmation now offers **Download** and **Copy to Clipboard** as buttons instead, which are the
two things the widget can actually do.

If you were using it, `onSubmit` below gives you a host-owned function to send the store
wherever you like, and `onChange`/`source` sync to a backend. If you just wanted the file in
someone's inbox, the reviewer already has it downloaded and on their clipboard.

### Submit through your own function

Use `onSubmit` when your application already has an endpoint or submission flow:

```ts
init({
  project: 'checkout-redesign',
  onSubmit: async (store) => {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(store),
    });
  },
});
```

When `onSubmit` is present, Pinflow shows a **Send to builder** action. Your function owns
authentication, transport, retries, and the user-facing delivery policy.

## Connect your own backend

Use `source` to read saved comments and `onChange` to report edits:

```ts
init({
  project: 'checkout-redesign',

  source: async () => {
    const response = await fetch('/api/feedback/comments');
    if (!response.ok) throw new Error('Could not load feedback');
    return response.json();
  },

  onChange: async (_store, change) => {
    const response = await fetch('/api/feedback/changes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(change),
    });
    if (!response.ok) throw new Error('Could not save feedback');
  },
});
```

`source` returns the current reviewer's comments. `onChange` receives an `add`, `update`, or
`delete` event after each saved change. Your backend should upsert by the comment's stable
`id` and treat deleting a missing id as a successful no-op.

Pinflow keeps local storage as a safety net. If loading from the backend fails, the local copy
continues to work. On the next successful load, local comments that never reached the server
are reported again through `onChange`.

When `source` is configured, `exportUi: 'auto'` hides the reviewer-side export controls because
the host normally owns collection. Set `exportUi: 'always'` if you want backend sync and local
export at the same time.

The full merge behavior, data shape, and backend responsibilities are documented in the
[sync protocol](https://github.com/brijeshp/pinflow/blob/main/PROTOCOL.md).

### Return a resolution to the reviewer

Your backend can return two team-owned fields through `source`:

```json
{
  "status": "done",
  "resolution": "Increased the contrast and added a disabled label."
}
```

Supported statuses are `open`, `done`, and `declined`. Done and declined comments become
read-only in the reviewer interface and show the team's note. Pinflow displays this state; it
does not include a team dashboard for setting it.

## Voice comments

Voice is optional and loaded only when configured. Text-only integrations do not download the
voice module.

```ts
init({
  project: 'checkout-redesign',
  voice: {
    tokenEndpoint: '/api/pinflow/deepgram-token',
  },
});
```

The endpoint must return a short-lived Deepgram grant token:

```json
{
  "access_token": "short-lived-token",
  "expires_in": 30
}
```

Never put a Deepgram API key in browser code. `devOnlyToken` accepts a short-lived grant token
on local origins only and throws during initialization anywhere else. If microphone access,
token minting, or transcription fails, Pinflow falls back to a text comment.

Voice is available through the installed ESM/CJS package. It is not supported by the CDN/IIFE
build. See the
[voice documentation](https://github.com/brijeshp/pinflow/blob/main/docs/wiki/voice.md) for
the token flow and failure behavior.

## Builder mode

Builder mode is an **export switch, not a screen**. `init({ mode: 'builder' })` makes
`exportMarkdown()`, `exportJSON()` and `downloadExport()` span _every_ reviewer store in the
current browser instead of just yours. It renders no chrome of its own — no chip, no drawer,
no pins from other reviewers — so you reach the aggregate through the handle:

```js
const pinflow = init({ project: 'checkout', mode: 'builder' });
pinflow.downloadExport(); // one artifact, every reviewer in this browser
```

It aggregates one **browser**, never a team: reviewers on other machines have their own
localStorage and never appear here. It is a convenience for backend-free reviews, not an
administrative or authenticated area.

> Before 0.9.0 this mode also drew a drawer with reviewer checkboxes, read-only foreign pins
> and a Clear all button. Nobody used it, and its data layer — one browser's localStorage —
> is not the one a real multi-reviewer tier would be built on, so the UI was removed rather
> than maintained. The aggregation it wrapped is untouched. The last commit containing it is
> tagged `builder-mode-final`.
> Treat the URL as a soft secret and do not rely on it for access control.

## Privacy and security

Pinflow does not send telemetry. With the default configuration, it makes no network requests
and stores feedback only in the reviewer's browser.

Network activity begins only when you configure one of these features:

- `source`, `onChange`, or `onSubmit`
- voice transcription
- the browser's normal request for the CDN script, if you use the script-tag installation

A comment contains more than its written text. To help find the selected element again,
Pinflow may record:

- element text, accessible name, and role;
- the nearest heading;
- test id, id, CSS, and XPath selector candidates;
- viewport size and relative click position;
- selected computed styles such as color, font, background, and radius;
- image and CSS background-image URLs, which may contain signed or tokenized CDN values.

Treat exported and synced comments as potentially sensitive user-generated data. Avoid using
Pinflow on pages that expose secrets or personal information unless your storage and access
controls are appropriate. Keep webhook URLs, API keys, and other reusable credentials on the
server.

Exported comment content is also untrusted input. Pinflow escapes its generated Markdown to
prevent comments or captured page text from creating new top-level instructions, but any
system that consumes feedback should still apply its normal validation and authorization
rules.

## Browser support and limitations

- Current and previous major versions of Chrome, Safari, Firefox, and Edge
- Mobile Safari and Chrome for Android
- React 18 or newer
- Vue 3 or newer
- Server rendering through the React and Vue wrappers; Pinflow becomes active in the browser

Known limitations:

- Elements inside iframes cannot be annotated.
- The CDN/IIFE build does not support voice comments.
- Builder mode reads local browser data; all-reviewer backend hydration is not included.
- Pinflow provides annotation and integration hooks, not user accounts, permissions, a hosted
  database, or a team dashboard.

## Troubleshooting

On a successful browser initialization, Pinflow logs one line like this:

```text
[pinflow] v0.3.0 ready — mode=reviewer, activation=both, 0 comments
```

If the widget does not appear:

1. Check the browser console for the ready line or an initialization error.
2. Confirm the CDN script loaded successfully, or confirm the installed package is present in
   your bundle.
3. Make sure `project` is a non-empty, stable string.
4. In Next.js, confirm the wrapper is mounted from a `'use client'` component.
5. Remember that stealth mode has no visible control and that iframe contents are outside
   Pinflow's reach.

## API at a glance

| Import                    | Use                                                                   |
| ------------------------- | --------------------------------------------------------------------- |
| `@brijeshp/pinflow`       | Core `init`, `destroy`, `routeOf`, version, types, and export helpers |
| `@brijeshp/pinflow/react` | React `<Annotator>` wrapper                                           |
| `@brijeshp/pinflow/vue`   | Vue `<Annotator>` wrapper                                             |
| `@brijeshp/pinflow/voice` | Internal lazy voice entry; do not import directly                     |

The handle returned by `init()` exposes:

| Method             | Use                                                            |
| ------------------ | -------------------------------------------------------------- |
| `destroy()`        | Remove Pinflow and release its listeners and active resources. |
| `refreshRoute()`   | Re-read `routeKey` and display pins for the current screen.    |
| `exportMarkdown()` | Return the current feedback as Markdown.                       |
| `exportJSON()`     | Return the current feedback as versioned JSON.                 |
| `downloadExport()` | Download Markdown and copy it to the clipboard.                |

For full signatures and types, see the
[API reference](https://github.com/brijeshp/pinflow/blob/main/docs/wiki/api.md).

## Examples

- [Vanilla HTML](https://github.com/brijeshp/pinflow/tree/main/examples/vanilla-html) — one
  script tag, no build step
- [React + Vite](https://github.com/brijeshp/pinflow/tree/main/examples/react-vite) — the React
  wrapper in a Vite app
- [Next.js](https://github.com/brijeshp/pinflow/tree/main/examples/nextjs) — App Router with a
  client boundary
- [Lovable or Bolt prototype](https://github.com/brijeshp/pinflow/tree/main/examples/lovable-prototype) —
  add Pinflow to generated output
- [Slack](https://github.com/brijeshp/pinflow/tree/main/examples/webhook-slack) — send feedback
  through a server-side webhook proxy
- [Discord](https://github.com/brijeshp/pinflow/tree/main/examples/webhook-discord) — send feedback
  through a server-side webhook proxy
- [Vercel + Notion](https://github.com/brijeshp/pinflow/tree/main/examples/webhook-vercel-notion) —
  store submissions with a serverless function
