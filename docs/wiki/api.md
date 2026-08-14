# Public API surface

Everything a host can call, as it exists in code. Entry points, config options, returned handles, theme tokens, and wrapper integration. When this page and `src/core/types.ts` disagree, types.ts wins — fix this page.

## Package exports

- **`pinflow`** (`src/core/index.ts` → `dist/index.js|cjs`) — core: `init()`, `destroy()`, `routeOf()`, `version`, exported types (incl. `PinflowTheme`), plus the artifact toolkit re-exports (`exportReviewer`, `exportBuilder`, `exportJSON`, `exportFilename` and the `DescribeRoute`/`ExportMeta`/`IsOrphaned` types) so hosts can render artifacts from their own data without an active instance.
- **`@brijeshp/pinflow/voice`** (`src/voice/index.ts` → `dist/voice.js|cjs`) — voice module; lazy-loaded by core when `config.voice` is set. Never import it directly.
- **`@brijeshp/pinflow/react`** (`src/react/index.ts` → `dist/react.js|cjs`) — `<Annotator>` component.
- **`@brijeshp/pinflow/vue`** (`src/vue/index.ts` → `dist/vue.js|cjs`) — `<Annotator>` component (registered name `PinflowAnnotator`).
- **CDN/IIFE** (`src/core/iife.ts` → `dist/pinflow.iife.js`) — auto-inits via `<script data-project="...">` or exposes `window.Pinflow.init()`.

## Core functions (`src/core/index.ts`)

- **`init(config: PinflowConfig): Handle`** — initializes the layer. Prints one `console.info` ready line on success (version, mode, activation, comment count) and a `console.error` before rethrowing on failure; inert paths (SSR, or a host that sets `reviewer` to an empty string) stay silent. Throws if `config.voice.devOnlyToken` is set on a non-local origin. Calling `init()` while another instance is active destroys the previous one and warns.
- **`destroy(): void`** — destroys the global singleton; no-op if none active.
- **`routeOf(url: string): string`** — route key from a full URL: `pathname + search` with pinflow params (`?reviewer=`, `?mode=`) stripped.
- **`version: string`** — compile-time `__PINFLOW_VERSION__` define (falls back to `'0.0.0'` under test).

## `Handle`

- **`destroy(): void`** — cleans up watchers, unmounts UI, stops voice. Safe to call repeatedly.
- **`refreshRoute(): void`** — re-evaluates the route/frame key, closes any open draft popup, finalizes in-flight voice to its frozen route, and re-renders pins. Automatic on URL changes; hosts using `config.routeKey` call it whenever their logical screen changes without a URL change.
- **`exportJSON(): string`** — versioned machine-readable corpus (`{ pinflowExport, generatedAt, comments }`); the current reviewer's store in reviewer mode, all stores in builder mode.
- **`exportMarkdown(): string`** — the markdown artifact, same generator as the export button; hosts place the submission moment themselves (stealth mode has no chrome).
- **`downloadExport(): void`** — downloads the artifact and copies it to the clipboard; no confirmation UI, the host owns UX.

SSR installs, and hosts that set `reviewer` to an empty string, return an inert handle exposing the full API (export getters return `''`; void methods no-op).

## `PinflowConfig` (`src/core/types.ts`)

Required: `project`.

| Option          | Type / values                                                   | Meaning                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project`       | `string`                                                        | localStorage namespace for this prototype's comments                                                                                                                                                                                                                                                                                                               |
| `reviewer`      | `string?`                                                       | explicit reviewer name; overrides the URL param and the minted anonymous handle                                                                                                                                                                                                                                                                                    |
| `mode`          | `'reviewer'` (default) \| `'builder'`                           | builder aggregates all reviewers read-only                                                                                                                                                                                                                                                                                                                         |
| `onSubmit`      | `(payload: ReviewerStore) => void \| Promise<void>`             | fires from the export sheet's "Send to builder" button (rendered only when `onSubmit` is configured); host owns upload/delivery — hosts pairing `onSubmit` with `source` should set `exportUi: 'always'` so the chip/sheet exists                                                                                                                                  |
| `onChange`      | `(store, { type: 'add'\|'update'\|'delete', comment }) => void` | fires after each persisted mutation; host owns debouncing; exceptions caught + logged; builder "Clear all" does not emit                                                                                                                                                                                                                                           |
| `source`        | `() => Promise<Comment[]>`                                      | read half of the sync protocol (`PROTOCOL.md`; `onChange` is the write half); fetched once when identity resolves, merged by id — higher `updatedAt` wins content but the server always wins `status`/`resolution`; local-only or locally-newer comments are re-announced through `onChange` (reconcile); rejection is silent and localStorage stays authoritative |
| `theme`         | `PinflowTheme?`                                                 | design tokens applied as `--pf-*` custom properties on the shadow host                                                                                                                                                                                                                                                                                             |
| `routeKey`      | `() => string`                                                  | custom frame/screen key (default: `pathname + search`); pair with `handle.refreshRoute()`                                                                                                                                                                                                                                                                          |
| `describeRoute` | `(key: string) => string`                                       | friendly label for a route key in export headings (stable key kept in backticks beneath); return `''` to keep the plain `## Route: <key>` heading                                                                                                                                                                                                                  |
| `exportUi`      | `'auto' \| 'always' \| 'never'`                                 | anytime-export affordance (reviewer mode): count chip + summonable sheet, popup `Export all · n` action, `⌘/Ctrl+Shift+E`; `'auto'` (default) = on for local-first installs, OFF when `source` is configured (a synced host owns collation); builder mode unaffected                                                                                               |
| `activation`    | `{ mode?: 'toggle' \| 'stealth' \| 'both' }`                    | default `both`: dock arm segment + Alt gestures (⌥+click = point on release, ⌥+drag = area, both ⌥ on Mac) / 400 ms long-press; `toggle` = arm segment only (no gestures); `stealth` = gestures only (no arm segment)                                                                                                                                              |
| `voice`         | `VoiceConfig?`                                                  | omit for pure text                                                                                                                                                                                                                                                                                                                                                 |

**Theming, simplest first**: (1) plain page CSS, no JS — custom properties
inherit through the shadow boundary, so `:root { --pf-accent: #b3005e }`
themes the widget; (2) `theme.accent` alone — `accentContrast` derives from
the accent's luminance (hex only; explicit wins); (3) the full token set
below. Defaults follow the PAGE's declared `color-scheme` via `light-dark()`
(inline `color-scheme: inherit` on the host — a stylesheet `:host`
declaration would lose to the host's inline `all:initial`).

**`PinflowTheme`** (all optional; stock look if omitted): `fontFamily`→`--pf-font-family`, `accent`→`--pf-accent`, `accentContrast`→`--pf-accent-contrast`, `surface`→`--pf-surface`, `text`→`--pf-text`, `textMuted`→`--pf-text-muted`, `danger`→`--pf-danger`, `radius`→`--pf-radius`, `shadow`→`--pf-shadow`.

**`VoiceConfig`** — credential resolution order: `getToken` → `tokenEndpoint` → `devOnlyToken`.

- `getToken?: () => Promise<string>` — custom token minter; rejection degrades to text.
- `tokenEndpoint?: string` — endpoint minting a short-lived Deepgram grant-token JWT (`{ access_token, expires_in }`).
- `devOnlyToken?: string` — LOCAL DEV ONLY; `init()` throws on non-local origins.

## Data types

- **`Comment`** — `id`, `createdAt`, `updatedAt`, `route`, `fullUrl`, `text`, `anchor`, `modality: 'text' | 'voice'`, `voice?: VoiceMeta`, plus the server-owned lifecycle disposition: `status?: 'open' | 'done' | 'declined'` and `resolution?: string` (≤500 chars). Disposition is set by the TEAM via the host and arrives through hydration — never written by the reviewer's device; absent = open.
- **`ReviewerStore`** — `reviewer`, `project`, `createdAt`, `comments[]`.
- **`Anchor`** — `selectors` (testid, id, css, xpath), `textFingerprint`, `positionPercent` (0..100 x/y), `viewport` (width, height), and optional pin-time `context`: accessible `name`/`role`/nearest `heading` (≤80 chars each), truncated image `src` for image pins, and a `styles` computed-style micro-snapshot (background, backgroundImage, color, fontSize, fontFamily, radius — defaults omitted) capturing what the reviewer actually saw. Area comments may also carry `covers`: up to 3 newline-separated labels (≤40 chars each) of the blocks the drawn rect was sampled over, since the containing ancestor a marquee climbs to can be a page-level container whose own text describes a different part of the page.

## React wrapper (`src/react/index.ts`)

`<Annotator {...PinflowConfig} />` renders `null`; mounts on first render. Re-inits only on stable primitives (`project`, `mode`, `reviewer`, `activation.mode`, `voice.tokenEndpoint`, `exportUi`). Function props (`onChange`, `onSubmit`, `source`, `routeKey`, `describeRoute`) DELEGATE to the latest render — fresh closures apply without re-init. Object props (`theme`, `activation`, `voice`) are snapshotted at init; change them via a keyed remount.

```jsx
import { Annotator } from '@brijeshp/pinflow/react';
<Annotator project="my-app" theme={{ accent: '#2d8b8b' }} onChange={handleChange} />;
```

## Vue wrapper (`src/vue/index.ts`)

Props cover the FULL `PinflowConfig`, with two renames: **`onSubmit` is exposed as `submitHandler`** and **`onChange` as `changeHandler`** (an `on*`-prefixed prop would be treated as an event listener by Vue). Object props (`theme`, `activation`, `voice`) are snapshotted at init so later mutation can't leak into a live config. Re-inits only on stable primitives (`project`, `mode`, `reviewer`, `activation.mode`, `voice.tokenEndpoint`, `exportUi`).

```vue
<script setup>
import { Annotator } from '@brijeshp/pinflow/vue';
</script>
<template>
  <Annotator project="my-app" :activation="{ mode: 'stealth' }" />
</template>
```

## IIFE / CDN

```html
<!-- auto-init -->
<script
  src="https://cdn.jsdelivr.net/npm/@brijeshp/pinflow@latest"
  data-project="my-prototype"
></script>

<!-- manual -->
<script src="https://cdn.jsdelivr.net/npm/@brijeshp/pinflow@latest"></script>
<script>
  const handle = window.Pinflow.init({ project: 'x', theme: { accent: '#f00' } });
  handle.destroy();
</script>
```

Note: voice does not work on the IIFE path (dynamic `@brijeshp/pinflow/voice` import has no resolver there); it degrades to text.

## Versioning & breaking changes

- Wrappers import bare `pinflow` (externalized), so consumers share one core singleton and wrappers version in lockstep with core.
- Changesets govern releases; breaking changes are committed as `feat(scope)!:` and documented in the changeset.
- Recent pre-1.0 breaks (see `.changeset/` and `CHANGELOG.md`): removed `position`/`hidden` config; explicit Save + Escape-to-discard popup flow; stealth identity deferred to first gesture; Vue `onSubmit` → `submitHandler`; host-defined `routeKey` + `refreshRoute()`; 0.5.0 removed the reviewer menu panel AND the bottom-right control (one bottom-left dock: arm segment + count chip; Clear all folded into Export & clear; `onSubmit`'s button moved to the export sheet; Alt+click now activates on release so Alt+drag can draw an area); 0.6.0 removed `config.submitTo`; 0.7.0 removed the init `window.prompt` — reviewers are minted an `anon_` handle and named optionally in the export sheet, and an unnamed export carries no `Reviewer:` line.
