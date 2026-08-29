# Pinflow — Spec

**Status:** v1 draft
**Audience:** the builder (you), the agent that will write the code (Claude Code), and future contributors
**Scope:** OSS JavaScript library, MIT-licensed, zero backend, single-builder workflow

> **Name:** Pinflow. Domain: `pinflow.dev` (available as of 2026-04-15). npm namespace `pinflow` confirmed available. Verify GitHub org `pinflow` and grab before first commit.

---

## 1. Why this exists

Vibe-coded prototypes are functional, shareable, and disposable. The feedback workflow around them is not. Today, an internal stakeholder reviewing a prototype takes a screenshot, opens PowerPoint, draws arrows, types a caption, and emails it back. The builder reads ten of these, mentally diffs them against the prototype, rewrites them as prompts, and feeds them into Claude Code or Cursor.

Every step of that loop is friction the prototype itself shouldn't have to absorb. This library is a one-line install that drops Figma-style pin-and-comment annotation directly onto any vibe-coded prototype, with an export format optimized for an AI agent to act on in the next pass.

The library is the wedge. It does one thing and does it beautifully. The eventual paid layer (out of scope for v1) will process the library's output into structured, conflict-resolved, prioritized prompt packs — but the library itself ships, spreads, and earns its place in the ecosystem on the strength of the annotation experience alone.

---

## 2. Product principles

These are the rules that govern every design and engineering decision. When in doubt, return to these.

**One-line install or it doesn't ship.** A single `<script>` tag for vanilla apps, a single import for React/Vue users. No config files. No build step required. No "first run" wizard.

**Zero backend.** No accounts, no auth, no servers we operate. localStorage is the database. The library works fully offline after the first script load.

**Three-second feedback bar.** A non-technical reviewer on a phone, mid-meeting, must be able to leave a useful comment in three seconds. Every interaction is measured against this.

**The reviewer never logs in.** Identity is captured via URL param, or an anonymous handle is minted silently; naming yourself is optional and happens at export. There is no account system, ever, in this library.

**Beautiful by default.** Design is a distribution asset. The library should look like it belongs inside a Linear or Vercel product, not inside a 2014 bug tracker. Screenshots of it should be tweet-worthy.

**The markdown export is the killer feature.** It is the single most important output of the library and must be optimized for direct paste into Claude Code or Cursor. If the export is mediocre, the entire AI-native positioning collapses.

**Builder vs reviewer modes are distinct.** Reviewers see their own pins only — they don't anchor on or self-censor against others' comments. Builders see everything.

**Defer everything.** Threading, @mentions, status, severity, assignees, notifications, multiple projects, voice, agent integrations — none of these ship in v1. The temptation to add them is the path to becoming BugHerd.

---

## 3. Scope

### In scope (v1)

- One-line script tag install (vanilla)
- npm package with React component wrapper
- Click-to-pin annotation on any DOM element
- Inline comment input (no modal)
- localStorage persistence per origin + route
- Reviewer identity via URL param or a silently minted anonymous handle, named optionally at export
- Mobile-responsive pin and input UX
- SPA route change detection
- Element selector generation that survives minor re-renders
- Builder mode toggle via URL param
- Markdown export (download + clipboard copy)
- Optional `onSubmit` callback hook for builders who want to POST comments to their own endpoint
- Self-hosted demo site at the project root

### Out of scope (v1) — explicit

These are the features people will ask for in week one. They are deliberately deferred.

- Comment threading or replies
- @mentions or notifications
- Status (open/resolved/in-progress)
- Severity, priority, or labels
- Assignees
- Voice notes (deferred to v2 with backend)
- Sketching or drawing tools
- Multiple-project workspace
- Hosted aggregation dashboard
- Real-time multi-reviewer collaboration
- Agent reviewer / AI-generated comments
- Conflict detection or semantic clustering
- Version-aware comment carryover
- Slack / Jira / Linear integrations
- Authentication of any kind
- Server-side anything

---

## 4. User flows

### 4.1 Builder flow

1. Builder finishes a prototype iteration in Claude Code, Cursor, Lovable, Bolt, etc.
2. Builder adds one line to the prototype (script tag or component import).
3. Builder deploys (Vercel preview, Replit, localhost tunnel, etc.).
4. Builder shares a URL with stakeholders. URL includes `?reviewer=NAME` per stakeholder, or stakeholders stay anonymous until they choose to name themselves at export.
5. Stakeholders leave comments asynchronously over hours or days.
6. Builder opens the same URL with `?mode=builder` (or a builder-specific link with a token in the hash).
7. Builder sees all pins from all reviewers, can filter by reviewer, can click any pin to read the comment.
8. Builder hits "Export" → markdown file downloads, also copied to clipboard.
9. Builder pastes markdown into Claude Code session as the next prompt.
10. Builder iterates the prototype. Pins from the previous round can be cleared (v1) or carried forward (deferred to v2).

### 4.2 Reviewer flow

1. Reviewer receives a link.
2. Reviewer opens it. If `?reviewer=NAME` is in the URL, identity is set silently. If not, nobody is asked anything at load: an anonymous handle (`anon_…`) is minted so the reviewer has a corpus of their own. A name already remembered in localStorage from an earlier visit wins over minting.
3. A subtle floating control appears (bottom-right) indicating annotation mode is available. Tapping/clicking it enters annotation mode.
4. Reviewer clicks any element on the page. A pin appears at the click location. An inline comment input appears next to it.
5. Reviewer types (or taps mic in v2). Saving is explicit: a Save button or Cmd/Ctrl+Enter persists; Escape or a click outside discards the draft.
6. Reviewer sees only their own pins. The pin count badge reflects only their comments.
7. Reviewer can edit or delete their own pins. They cannot see or interact with other reviewers' pins.
8. Reviewer navigates to other routes within the SPA; their pins persist per route.
9. When done, the reviewer hits "Export & share" in the floating control. The export sheet carries an optional name field — the one moment attribution matters and the only one where the reviewer has context for the question. It is prefilled if they have named themselves before, and skippable; an unnamed export claims no author. A markdown file containing all their comments is downloaded to their device.
10. A confirmation panel appears with simple guidance: "Share this file with the builder however works for you — email, Slack, message, etc." No prescribed channel. No "send" button that the library owns.
11. The confirmation is also where the reviewer disposes of the exported batch. A quiet "Clear comments" sits opposite Done and takes two taps: the first arms it, renames it to "Clear 3 comments?" and states the consequence the panel can honestly claim — "The exported file is unaffected" when the clipboard verified, or "Check the file downloaded first: there is no other copy" when nothing could be verified. This is deliberately NOT offered on the export sheet — the sheet knows nothing about whether the export landed, and `download()` cannot report failure, so a wipe authorised there could destroy a corpus that was never delivered.
12. The wipe is scoped to the exported revisions — content recency and the server-owned disposition alike: comments added, edited, or resolved by the team after the export carry something the file does not hold, so they survive the clear, and if nothing of the batch remains the control retires (at either tap) rather than arming or claiming success. A second tap inside the arming window is swallowed (a double-tap must not satisfy both taps), and touching anything else — another panel action or the host page itself — disarms. The wipe verifies before it reports: it waits out an in-flight sync, claims success only when the final stored state supports it, and says so plainly when a storage write fails. Clearing leaves the confirmation open with both retry channels live: they re-send the artifact already built, so a reviewer who clears and only then notices nothing downloaded can still recover the file.
13. Reviewer's localStorage is otherwise preserved, so they can keep editing or re-export later.

---

## 5. Technical specification

### 5.1 Installation

**Vanilla / script tag (the default path):**

```html
<script src="https://cdn.jsdelivr.net/npm/pinflow@latest" data-project="my-prototype"></script>
```

That's it. No init call required for the default behavior. The `data-project` attribute namespaces localStorage so multiple prototypes on the same origin don't collide.

**npm / React:**

```bash
npm install pinflow
```

```jsx
import { Annotator } from 'pinflow/react';

export default function App() {
  return (
    <>
      <Annotator project="my-prototype" />
      {/* rest of app */}
    </>
  );
}
```

**Optional configuration (both paths):**

```js
window.Pinflow.init({
  project: 'my-prototype', // namespace for localStorage
  reviewer: 'Sarah', // override URL param
  mode: 'reviewer', // 'reviewer' | 'builder'
  onSubmit: (comments) => {
    /* ... */
  }, // called when reviewer hits Submit
  theme: 'auto', // 'light' | 'dark' | 'auto'
  position: 'bottom-right', // floating control position
  hidden: false, // hide the floating control entirely (programmatic mode)
});
```

### 5.2 Element selection and pin anchoring

The library must generate selectors that survive minor re-renders, since vibe-coded prototypes get rebuilt frequently. The selector strategy, in priority order:

1. `data-testid` attribute if present
2. Stable `id` attribute (excluding auto-generated framework IDs that look like `__123abc`)
3. Semantic selector path using tag + class + nth-of-type
4. XPath as a tertiary fallback

For each pin, store **all four** so re-renders can be matched against any of them. Also store a text-content fingerprint (first 80 chars of the element's visible text) as an additional matching signal.

**Pin position** is stored as percentage offsets from the element's top-left, not viewport coordinates. This way, pins remain anchored when the element moves or resizes.

**Orphaned pins** (where the target element no longer exists in the DOM after a re-render) are surfaced in a separate "orphaned" list in the builder export, with the last known selector and the comment preserved.

### 5.3 Persistence

All data lives in localStorage under the key `pinflow:${project}:${reviewer}`. The shape:

```json
{
  "reviewer": "Sarah",
  "project": "my-prototype",
  "createdAt": "2026-04-15T14:23:00Z",
  "comments": [
    {
      "id": "cmt_xyz123",
      "createdAt": "2026-04-15T14:24:00Z",
      "updatedAt": "2026-04-15T14:24:30Z",
      "route": "/pricing",
      "fullUrl": "https://prototype.vercel.app/pricing",
      "text": "This CTA gets lost against the background.",
      "anchor": {
        "selectors": {
          "testid": "primary-cta",
          "id": null,
          "css": "main > section:nth-of-type(1) > button.cta-primary",
          "xpath": "/html/body/main/section[1]/button[1]"
        },
        "textFingerprint": "Get started for free",
        "positionPercent": { "x": 47.2, "y": 38.1 },
        "viewport": { "width": 390, "height": 844 }
      }
    }
  ]
}
```

Builder mode reads from all `pinflow:${project}:*` keys in the local browser to aggregate across reviewers — useful when the builder happens to be on the same machine as the reviewers (e.g., walking around an office for live feedback). For distributed reviews, each reviewer exports their own markdown file and shares it with the builder. The builder consolidates by either pasting multiple files into Claude Code as one prompt, or by running them through the eventual paid layer that does aggregation server-side.

### 5.4 Reviewer identity

Identity resolution, in priority order:

1. `?reviewer=NAME` in URL → stored in localStorage, name is locked for this session
2. Existing localStorage value → reused silently
3. None of the above → an anonymous handle (`anon_…`) is minted silently and stored in localStorage, so the reviewer has a corpus of their own without ever being asked who they are. The handle is a storage key, never a display name: it is gated out of the export, and the reviewer claims attribution by filling the optional name field on the export sheet.

Names are not validated, not unique, not authenticated. This is intentional. The library trusts the reviewer to enter their name correctly. Bad data here is the builder's problem to clean up at export time, not a problem to solve at the library level.

### 5.5 Builder mode

Builder mode is activated by `?mode=builder` in the URL or by `mode: 'builder'` in the init config. Builder mode is a convenience for the case where the builder happens to be reviewing on the same browser as some or all of the reviewers (e.g., during local dogfooding, or when the builder pulls reviewers' devices to consolidate). For distributed reviews, the primary collection path is reviewer-side export — see Section 5.6.

In builder mode:

- All pins from all reviewers stored in this browser's localStorage are rendered on the page
- A control panel appears (bottom-left or as a slide-out drawer) showing:
  - Reviewer filter (checkboxes per reviewer)
  - Comment count by reviewer
  - "Export all" button (downloads aggregated `.md` and copies to clipboard)
  - Clear-all button (with confirmation)
- Each pin shows the reviewer's name on hover
- Builder cannot edit reviewer comments (read-only — preserves trust)
- Builder can delete pins (with confirmation)

**No authentication on builder mode.** Anyone with `?mode=builder` in the URL gets builder access. This is a deliberate v1 simplification; the assumption is that if you're sharing the URL with stakeholders, you're sharing the reviewer-mode URL, not the builder-mode URL. Treat the `?mode=builder` URL as a soft secret. Revisit after dogfooding.

### 5.6 Export

Export is the primary collection mechanism. Both reviewer mode and builder mode expose an export action.

**Reviewer export (the default path):**

- Trigger: "Export & share" button in the floating control's expanded panel
- Action: Generates a markdown file containing all of _this reviewer's_ comments across all routes, downloads it as `pinflow-feedback-${reviewer}-${project}-${timestamp}.md`, and also copies the contents to the clipboard
- After export: A small confirmation panel appears with copy along the lines of "Saved to your downloads. Share this file with the builder however works for you — email, Slack, message, drop it in a folder, whatever."
- The library does not own the share channel. It does not open a mailto, does not POST anywhere, does not suggest a specific tool. It produces a file and gets out of the way.
- Reviewer's localStorage is preserved after export. They can keep editing and re-export, or discard the exported batch from the confirmation panel (two-tap "Clear comments", scoped to the exported revisions — content and disposition — emitting a delete per comment on the sync wire).

**Builder export (the same-browser convenience path):**

- Trigger: "Export all" button in the builder mode control panel
- Action: Generates a markdown file aggregating all comments from all reviewers stored in this browser's localStorage, downloads as `pinflow-feedback-${project}-aggregate-${timestamp}.md`, and copies to clipboard
- Format includes per-reviewer attribution, route grouping, and the orphaned-comments section (see Section 7)

**Format:** see Section 7 below. Reviewer export omits the multi-reviewer summary; builder export includes it.

### 5.7 onSubmit callback (optional, advanced)

For builders who want to skip the file-sharing step entirely and collect comments to a server they control, the library exposes an optional callback:

```js
init({
  onSubmit: async (payload) => {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
});
```

When `onSubmit` is configured, an additional "Send to builder" button appears alongside "Export & share" in the reviewer's panel. The reviewer chooses which they prefer; both are valid paths. The callback receives the same JSON payload that would be serialized into the markdown export.

This is documented as an advanced feature, not the recommended path. Most builders should rely on reviewer-side export. Reference implementations live in `/examples/` (Discord webhook, Slack webhook, Vercel function writing to Notion).

---

## 6. Visual design principles

The library has visual surface area in three places: the floating control, the pins, and the comment input. Each must be polished. Specific design decisions are left to the builder, but the principles are non-negotiable.

**The floating control** is a small, unobtrusive button or pill, positioned bottom-right by default, that does not interfere with the prototype's own UI. It uses a high-contrast neutral palette (works against light or dark backgrounds) and respects the reviewer's prefers-color-scheme. When tapped, it expands to show: a count of the reviewer's own comments, an "Add comment" affordance, and an "Export & share" affordance. The expanded panel is also where the post-export confirmation appears.

**Pins** are circular markers, ~24px on desktop and ~32px on mobile (touch target), with a subtle drop shadow and a clear active state. They animate in with a brief scale-up. They never block clicks on the underlying element when the reviewer is not in annotation mode.

**The comment input** appears inline next to the pin, anchored such that it's always fully visible (auto-flips above/below/left/right of the pin based on viewport). It's a single fixed-height textarea (three rows, scrolling past roughly six lines) with a placeholder ("What should change?") and no formatting controls. Saving is explicit: a Save button or Cmd/Ctrl+Enter persists the comment; Escape or a click outside discards the draft. A delete affordance is available but de-emphasized.

**Empty state** for builder mode (no comments yet): minimal, encouraging, includes the share URL ready to copy.

**Mobile considerations:** all hit targets ≥44px, pin placement accounts for thumb zones, comment input doesn't get covered by mobile keyboard (input scrolls into view above the keyboard).

**No emojis in default UI copy. No "fun" microcopy. No exclamation marks.** This product earns trust from non-technical reviewers by feeling like infrastructure, not a toy.

---

## 7. Markdown export specification

This is the most important output of the library. The format below is optimized for direct paste into Claude Code or Cursor.

There are two variants: **reviewer export** (single reviewer's comments) and **builder export** (aggregated across all reviewers in the local browser). The builder variant adds a multi-reviewer summary at the top and per-comment reviewer attribution; otherwise the structure is identical.

### 7.1 Reviewer export (single reviewer)

```markdown
# Feedback for my-prototype — from Sarah

Generated: 2026-04-15T14:45:00Z
Reviewer: Sarah
Total comments: 4
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

---

### Comment 2 — 2026-04-15T14:31:00Z

**Element:** `<h1>` ("Welcome to Sensavera")
**Selector candidates:**

- testid: (none)
- css: `main > header > h1`
- xpath: `/html/body/main/header/h1`
  **Position:** 12% from left, 50% from top of element
  **Viewport at time of comment:** 1440×900 (desktop)

> Headline is doing too much. Maybe just "Sensavera" with a tagline below?

---

(... continues, grouped by route ...)
```

### 7.2 Builder export (aggregated across reviewers in this browser)

```markdown
# Feedback for my-prototype

Generated: 2026-04-15T14:45:00Z
Reviewers: Sarah, Mike, Jen (3 total, 8 comments)
Routes covered: /, /pricing, /signup

---

## Summary

8 comments across 3 routes.

By reviewer:

- Sarah — 4 comments
- Mike — 3 comments
- Jen — 1 comment

By route:

- /pricing — 4 comments
- / — 3 comments
- /signup — 1 comment

---

## Route: /

### Comment 1 — Sarah, 2026-04-15T14:24:00Z

**Element:** `<button data-testid="primary-cta">` ("Get started for free")
**Selector candidates:**

- testid: `primary-cta`
- css: `main > section:nth-of-type(1) > button.cta-primary`
- xpath: `/html/body/main/section[1]/button[1]`
  **Position:** 47% from left, 38% from top of element
  **Viewport at time of comment:** 390×844 (mobile)

> This CTA gets lost against the background.

---

### Comment 2 — Mike, 2026-04-15T14:31:00Z

**Element:** `<h1>` ("Welcome to Sensavera")
**Selector candidates:**

- testid: (none)
- css: `main > header > h1`
- xpath: `/html/body/main/header/h1`
  **Position:** 12% from left, 50% from top of element
  **Viewport at time of comment:** 1440×900 (desktop)

> Headline is doing too much. Maybe just "Sensavera" with a tagline below?

---

(... continues, grouped by route ...)

---

## Orphaned comments

The following comments were left on elements that no longer exist in the current DOM. They are preserved here for context.

### Comment N — Jen, 2026-04-14T09:12:00Z

**Last known element:** `<div class="legacy-banner">` ("Limited time offer")
**Last known selector:** `body > div.legacy-banner`
**Route:** /

> Not sure this banner is on-brand.
```

### 7.3 Format rules (both variants)

- Sections separated by `---` for visual scannability
- Each comment shows the element identity in a way the agent can locate it (selector candidates + visible text fingerprint)
- Comment text always rendered as a blockquote for clear visual separation from metadata
- Routes ordered by comment count (most-commented first)
- Builder export adds reviewer name to each comment heading; reviewer export omits it (it's redundant with the document title)
- Orphaned section appears only if there are orphaned comments
- All timestamps in ISO 8601 UTC

### 7.4 When the builder receives multiple reviewer files

The builder may receive several reviewer-export files via email/Slack and want to consolidate them. v1 doesn't ship a CLI for this — the builder either pastes them sequentially into Claude Code (which handles it fine) or waits for the paid layer that does intelligent aggregation, conflict detection, and prioritization. Document this honestly in the README; don't pretend the OSS library solves consolidation.

---

## 8. Browser and framework support

**Browsers:** Last 2 versions of Chrome, Safari, Firefox, Edge. Mobile Safari and Chrome Android.

**Frameworks:** Vanilla JS (script tag), React 18+, Vue 3+. Next.js, Remix, Vite, Astro, and Lovable/Bolt outputs work via the script tag path with no special handling.

**SPA route changes:** Detected via `popstate`, `pushState`, `replaceState` patches, plus a MutationObserver fallback. Pin rendering is re-evaluated on every detected route change.

**Iframe handling:** v1 does not annotate inside iframes. Pins on iframes are not supported.

---

## 9. Privacy and security

**Data location:** All comments live in the reviewer's browser localStorage. Nothing is sent anywhere unless the builder configures `onSubmit`.

**No telemetry, ever.** The library does not phone home. No analytics, no error reporting to a remote service, no usage metrics. If we want adoption telemetry later, it is opt-in and controlled by the builder via init config.

**Screenshot handling:** v1 does not capture screenshots client-side (this is heavyweight and adds dependencies). Comments are anchored to elements, and the builder can recreate context by visiting the route. Screenshots are deferred to v2.

**Sensitive data:** The library captures element text content as a fingerprint. Builders deploying this on prototypes that contain real PHI/PII should be aware that this text lives in the reviewer's localStorage. Document this clearly in the README.

**XSS:** All user-entered comment text is rendered as plain text, never as HTML. The library's own DOM injection uses textContent or sanitized fragments.

---

## 10. Repository structure

```
pinflow/
├── README.md                 # one-line install front and center, with a GIF
├── LICENSE                   # MIT
├── CONTRIBUTING.md
├── CHANGELOG.md
├── package.json
├── src/
│   ├── core/                 # framework-agnostic core
│   ├── react/                # React wrapper
│   ├── vue/                  # Vue wrapper
│   └── styles/               # CSS (or CSS-in-JS, builder's call)
├── dist/                     # build output (gitignored, published to npm)
├── examples/
│   ├── vanilla-html/
│   ├── react-vite/
│   ├── nextjs/
│   ├── lovable-prototype/
│   ├── webhook-discord/
│   ├── webhook-slack/
│   └── webhook-vercel-notion/
├── demo/                     # the demo site, deployed to project URL
└── tests/
```

**Build:** ESM + UMD bundles. Single-file UMD for the script tag path (≤30KB gzipped target). Tree-shakeable ESM for npm consumers.

**README priorities:** the one-line install must be in the first 20 lines. The first thing below the title is a GIF showing the click-to-pin-and-comment interaction. Everything else is below the fold.

---

## 11. v1 acceptance criteria

The library is ready for v1 release when all of the following are true:

1. A single `<script>` tag added to a vanilla HTML page enables annotation with no further config.
2. A reviewer can click any element on a deployed prototype, type a comment, and the comment persists across page reloads — without ever logging in.
3. A reviewer's comments persist across SPA route changes within the same origin.
4. A second reviewer (different name) on the same browser sees only their own comments, never the first reviewer's.
5. A reviewer can hit "Export & share" and receive a clean markdown file containing all of their comments, with a confirmation panel that suggests sharing it via any channel of their choice.
6. Builder mode (`?mode=builder`) shows all comments from all reviewers stored in this browser, with an "Export all" action that produces an aggregated markdown file matching the spec in Section 7.2.
7. Both export variants (reviewer and builder) match the format spec in Section 7 exactly.
8. The exported markdown can be pasted into Claude Code as a prompt and Claude Code can locate and address the commented elements without the builder providing additional context.
9. Pins remain visually anchored to their target elements when the page is resized or the element shifts due to surrounding content changes.
10. The library works on mobile Safari and mobile Chrome with full functionality, including the export-and-download flow.
11. The published npm package and CDN bundle are both ≤30KB gzipped.
12. The README's one-line install is verifiable by a developer who has never seen the library before, in under 60 seconds.

---

## 12. Deferred to v2 and beyond

Documented here so the team has a clear roadmap and the v1 scope stays disciplined.

**v2 candidates (post-traction):**

- Voice notes with server-side transcription
- Client-side screenshot capture (using html2canvas or equivalent)
- Sketching / drawing layer
- Carry-forward heuristics for orphaned comments after re-vibes
- Browser extension version for annotating sites you don't control

**Paid layer (Shape B — separate product, separate repo):**

- Conflict detection across reviewers
- Semantic clustering of similar comments
- Severity and intent inference
- Component-aware grouping in the brief
- "/review-feedback" Claude Code slash command
- Hosted aggregation for distributed teams (the moment it's clearly necessary, not before)

**Never (out of category):**

- Threading, replies, @mentions
- Status workflows / kanban
- Issue tracker integrations as first-class features
- Anything that turns this into BugHerd

---

## 13. Open questions

These are decisions to make before or during build, not blockers to starting.

1. **CSS strategy.** Inline styles, CSS file shipped with the bundle, or shadow DOM to avoid host-page style collisions? Lean shadow DOM — strongest isolation and avoids the "my host site has weird global CSS that breaks the pin" class of bugs.
2. **React wrapper as separate package or single package with subpath imports?** Lean subpath imports for simpler install, ship as `pinflow/react`.
3. **License the export format itself?** Probably not, but worth noting that we want third-party tools to be able to consume it freely. Document the format in the repo so others can build against it.
4. **Demo site at pinflow.dev.** The demo _is_ the marketing site — there is no separate landing page. Visitors land on a working interactive demo where they can try annotation immediately, then see the install snippet below.
