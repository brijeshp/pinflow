# Public API surface

Everything a host can call, as it exists in code. Entry points, config options, returned handles, theme tokens, and wrapper integration. When this page and `src/core/types.ts` disagree, types.ts wins — fix this page.

## Package exports

- **`pinflow`** (`src/core/index.ts` → `dist/index.js|cjs`) — core: `init()`, `destroy()`, `routeOf()`, `version`, exported types.
- **`pinflow/voice`** (`src/voice/index.ts` → `dist/voice.js|cjs`) — voice module; lazy-loaded by core when `config.voice` is set. Never import it directly.
- **`pinflow/react`** (`src/react/index.ts` → `dist/react.js|cjs`) — `<Annotator>` component.
- **`pinflow/vue`** (`src/vue/index.ts` → `dist/vue.js|cjs`) — `<Annotator>` component (registered name `PinflowAnnotator`).
- **CDN/IIFE** (`src/core/iife.ts` → `dist/pinflow.iife.js`) — auto-inits via `<script data-project="...">` or exposes `window.Pinflow.init()`.

## Core functions (`src/core/index.ts`)

- **`init(config: PinflowConfig): Handle`** — initializes the layer. Throws if `config.voice.devOnlyToken` is set on a non-local origin. Calling `init()` while another instance is active destroys the previous one and warns.
- **`destroy(): void`** — destroys the global singleton; no-op if none active.
- **`routeOf(url: string): string`** — route key from a full URL: `pathname + search` with pinflow params (`?reviewer=`, `?mode=`) stripped.
- **`version: string`** — compile-time `__PINFLOW_VERSION__` define (falls back to `'0.0.0'` under test).

## `Handle`

- **`destroy(): void`** — cleans up watchers, unmounts UI, stops voice. Safe to call repeatedly.
- **`refreshRoute(): void`** — re-evaluates the route/frame key and re-renders pins. Automatic on URL changes; hosts using `config.routeKey` call it whenever their logical screen changes without a URL change.

## `PinflowConfig` (`src/core/types.ts`)

Required: `project`.

| Option       | Type / values                                                   | Meaning                                                                                                                  |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `project`    | `string`                                                        | localStorage namespace for this prototype's comments                                                                     |
| `reviewer`   | `string?`                                                       | explicit reviewer name; overrides URL param and prompt                                                                   |
| `mode`       | `'reviewer'` (default) \| `'builder'`                           | builder aggregates all reviewers read-only                                                                               |
| `onSubmit`   | `(payload: ReviewerStore) => void \| Promise<void>`             | fires on explicit "Export & share"; host owns upload/download                                                            |
| `onChange`   | `(store, { type: 'add'\|'update'\|'delete', comment }) => void` | fires after each persisted mutation; host owns debouncing; exceptions caught + logged; builder "Clear all" does not emit |
| `theme`      | `PinflowTheme?`                                                 | design tokens applied as `--pf-*` custom properties on the shadow host                                                   |
| `routeKey`   | `() => string`                                                  | custom frame/screen key (default: `pathname + search`); pair with `handle.refreshRoute()`                                |
| `activation` | `{ mode?: 'toggle' \| 'stealth' \| 'both' }`                    | `toggle` = visible button (default); `stealth` = Alt+click / long-press only                                             |
| `voice`      | `VoiceConfig?`                                                  | omit for pure text                                                                                                       |

**`PinflowTheme`** (all optional; stock look if omitted): `fontFamily`→`--pf-font-family`, `accent`→`--pf-accent`, `accentContrast`→`--pf-accent-contrast`, `surface`→`--pf-surface`, `text`→`--pf-text`, `textMuted`→`--pf-text-muted`, `danger`→`--pf-danger`, `radius`→`--pf-radius`, `shadow`→`--pf-shadow`.

**`VoiceConfig`** — credential resolution order: `getToken` → `tokenEndpoint` → `devOnlyToken`.

- `getToken?: () => Promise<string>` — custom token minter; rejection degrades to text.
- `tokenEndpoint?: string` — endpoint minting a short-lived Deepgram grant-token JWT (`{ access_token, expires_in }`).
- `devOnlyToken?: string` — LOCAL DEV ONLY; `init()` throws on non-local origins.

## Data types

- **`Comment`** — `id`, `createdAt`, `updatedAt`, `route`, `fullUrl`, `text`, `anchor`, `modality: 'text' | 'voice'`, `voice?: VoiceMeta`.
- **`ReviewerStore`** — `reviewer`, `project`, `createdAt`, `comments[]`.
- **`Anchor`** — `selectors` (testid, id, css, xpath), `textFingerprint`, `positionPercent` (0..1 x/y), `viewport` (width, height).

## React wrapper (`src/react/index.ts`)

`<Annotator {...PinflowConfig} />` renders `null`; mounts on first render. Re-inits only on stable primitives (`project`, `mode`, `reviewer`, `activation.mode`, `voice.tokenEndpoint`) — memoize inline objects to avoid unnecessary re-inits.

```jsx
import { Annotator } from 'pinflow/react';
<Annotator project="my-app" theme={{ accent: '#2d8b8b' }} onChange={handleChange} />;
```

## Vue wrapper (`src/vue/index.ts`)

Props mirror `PinflowConfig` except **`onSubmit` is exposed as `submitHandler`** (an `on*`-prefixed prop would be treated as an event listener by Vue). Re-inits only on stable primitives.

```vue
<script setup>
import { Annotator } from 'pinflow/vue';
</script>
<template>
  <Annotator project="my-app" :activation="{ mode: 'stealth' }" />
</template>
```

## IIFE / CDN

```html
<!-- auto-init -->
<script src="https://cdn.jsdelivr.net/npm/pinflow@latest" data-project="my-prototype"></script>

<!-- manual -->
<script src="https://cdn.jsdelivr.net/npm/pinflow@latest"></script>
<script>
  const handle = window.Pinflow.init({ project: 'x', theme: { accent: '#f00' } });
  handle.destroy();
</script>
```

Note: voice does not work on the IIFE path (dynamic `pinflow/voice` import has no resolver there); it degrades to text.

## Versioning & breaking changes

- Wrappers import bare `pinflow` (externalized), so consumers share one core singleton and wrappers version in lockstep with core.
- Changesets govern releases; breaking changes are committed as `feat(scope)!:` and documented in the changeset.
- Recent pre-1.0 breaks (see `.changeset/` and `CHANGELOG.md`): removed `position`/`hidden` config; explicit Save + Escape-to-discard popup flow; stealth identity deferred to first gesture; Vue `onSubmit` → `submitHandler`; host-defined `routeKey` + `refreshRoute()`.
