# Changelog

## 0.4.0

### Minor Changes

- 1f626bb: Adaptive theming — the widget now matches its host page by default, and
  branding it takes one variable:
  - **Follows the page's scheme, not the OS**: surfaces use `light-dark()`
    defaults and the shadow host carries inline `color-scheme: inherit`, so a
    light-only site gets a light widget even on dark-OS machines (previously an
    OS media query forced dark panels onto light pages), and a page declaring
    `color-scheme: dark` gets a dark widget.
  - **Dark-surface bug fixed**: panel and drawer secondary buttons had
    hardcoded light chrome (`#f8fafc` backgrounds) that turned unreadable on
    dark surfaces — "Export & clear" was invisible on dark-themed hosts. All
    button chrome now derives from `currentColor`; pin/chip rings ride the
    surface token instead of hardcoded white.
  - **One-variable theming**: setting `theme.accent` alone now derives a
    readable `accentContrast` from the accent's luminance (hex accents;
    explicit values always win). And because CSS custom properties inherit
    through shadow DOM, plain page CSS works with no JS config at all:
    `:root { --pf-accent: #your-brand }`.

  Core ceilings notched 14.55/14.2 KB gz (light-dark()/color-mix strings +
  the luminance derivation; measured ~200 B).

### Patch Changes

- 2587a8d: Clicking an existing pin while annotate mode is armed now disarms the mode and closes the menu, matching new-pin placement. Previously the edit popup opened with the crosshair cursor and document capture listener still active — a subsequent outside click could dismiss the popup and place a spurious pin from the same event — and the menu panel stayed open underneath the popup.

## 0.3.0

### Minor Changes

- 2a620c3: The 0.3.0 onboarding release — every item traces to the first external user's
  feedback session:
  - **Activation defaults to `'both'`** (breaking): Alt+click (Windows/Linux:
    Alt; macOS: ⌥) and 500 ms long-press work with zero config, alongside the
    button. Pass `activation: { mode: 'toggle' }` to restore the old default.
  - **Two-step pinning**: the control button itself arms annotate mode (button,
    then page) — the "Add comment" middle step is gone. Placing a pin closes
    the menu; a second control click is a full stop.
  - **Fail-loud boot**: one `console.info` ready line (version, mode,
    activation, comment count) on success; `console.error` before rethrow on
    init failure. Inert paths (SSR, declined identity) stay silent.
  - **Fuzzy re-anchor**: when every exact candidate misses, a Dice-similarity
    pass (≥0.6, same-tag bias) re-attaches lightly reworded elements instead of
    orphaning; successful heals persist rebuilt selectors so the next load
    matches exactly. Unrecognizable content stays an honest orphan.
  - **Orphans hide** instead of floating gray mid-page; the export sheet
    reports "· n unanchored" and heals un-hide.
  - **Reviewer batch controls**: "Clear all" (confirm surface) in the menu and
    "Export & clear" in the sheet; every removal emits its own `onChange`
    delete so synced hosts stay consistent.
  - Hardening found by the new flow: armed clicks on pinflow's own UI are
    guarded via composedPath, and `download()` clicks a detached anchor (an
    attached one re-entered the armed handler and could place a bogus pin).

  The fingerprint fallback walk no longer early-returns on the first exact
  match — it completes its (still 2000-element-capped) scan so containment
  chains resolve to the deepest element. Slightly more work on a last-ditch
  path, traded for never pinning a wrapper.

  Core ceilings notched for the feature set: IIFE 14.3 / ESM 13.95 KB gz
  (features +0.60 KB, review-round hardening ~+0.15 KB; margin covers linux-CI
  gzip drift).

## 0.2.2

### Patch Changes

- Registry-side republish of 0.2.1: the first npm publish landed in npm's
  staged-packages flow and permanently consumed the 0.2.1 version number
  before public release. No code changes versus 0.2.1.

## 0.2.1

### Patch Changes

- ffccd44: Fix nested-target capture: pins now anchor to the nearest `[data-testid]`
  ancestor of the click target. Clicking a label span or icon nested inside an
  anchored control previously recorded `testid: (none)` and fell back to brittle
  css/xpath selectors, defeating host-side test-id contracts. The whole anchor —
  selectors, text fingerprint, context, and `positionPercent` — is now built from
  the anchored ancestor, so re-pinning stays coherent with the recorded rect.
  Empty/whitespace `data-testid` values are skipped, and elements with no
  anchored ancestor behave exactly as before.

## 0.2.0

### Minor Changes

- db26b9e: Published to npm as **`@brijeshp/pinflow`** (the unscoped `pinflow` name is
  taken by an unrelated package). All module specifiers change accordingly:
  - `import { init } from '@brijeshp/pinflow'`
  - `import { Annotator } from '@brijeshp/pinflow/react'` (same for `/vue`)
  - voice stays a lazy internal seam at `@brijeshp/pinflow/voice` — still zero
    bytes for text users
  - CDN: `https://cdn.jsdelivr.net/npm/@brijeshp/pinflow` now serves the IIFE
    directly (new `jsdelivr`/`unpkg` fields)

  Runtime identity is unchanged: storage keys (`pinflow:c:…`), `window.Pinflow`,
  the worklet processor name, export artifact fields, and DOM/css hooks all keep
  the `pinflow` brand — existing stored comments survive the upgrade untouched.

  Vue wrapper budget notched 0.6 → 0.61 KB gz: the scoped import specifier is
  longer; measured cost 4 B.
  Core ceilings notched to 13.48 (IIFE) / 13.14 KB (ESM) gz: the externalized
  `@brijeshp/pinflow/voice` specifier ships verbatim in core (+10 chars), and
  linux CI gzip runs a few bytes over the macOS measurement — CI is the
  enforcing environment, so ceilings are set from CI actuals (13.46 / 13.12).

## 0.1.1

### Patch Changes

- 5a35e4f: Fix exported xpath selectors: the ancestor walk included `<body>` while the
  builder also prepended `/html/body/`, so every artifact's xpath candidate read
  `/html/body/body[1]/…` and resolved to nothing (re-anchoring silently fell back
  to css/fingerprint). Caught by a reviewer artifact from the first live
  anytime-export session.

## 0.1.0

### Minor Changes

- 71b6030: Anytime export: a summonable export affordance in every mode, not just at the end.
  - **Count chip** (reviewer mode): a small circle in the pins' visual vocabulary, bottom-left, appearing once the reviewer has a comment. Tapping it summons an anchored export sheet (`n comments · m screens` + **Export & share**) wired to the standard flow — download + clipboard + the `submitTo` mailto hand-off. Dismissed by chip toggle or a completed outside tap (pinch/scroll never dismisses).
  - **Draft popup action**: `Export all · n` in the comment popup — saves your draft first, then opens the sheet. Frozen (resolved) popups are unaffected.
  - **Hotkey**: `⌘/Ctrl+Shift+E` opens the sheet on desktop.
  - **`exportUi` config** (`'auto' | 'always' | 'never'`, default `'auto'`): on for local-first installs, off automatically when `source` is configured (a synced host owns collation). Builder mode is unchanged — its drawer already exports anytime.

  Core budgets ratcheted for the feature: ESM 12.15 KB, IIFE 12.5 KB (gz); ~0.65 KB actual cost including the review-hardening pass (surface-state tracking, lossless draft handling, anchor fallbacks).

- 9de6211: Razor-thin bundle overhaul: review remediation, build optimization, and pre-1.0 API corrections.

  **Breaking (pre-1.0):**
  - Removed `PinflowConfig.position` (control is fixed bottom-right), `PinflowConfig.hidden` (use `activation: { mode: 'stealth' }`), and `ActivationConfig.longPressMs`.
  - Vue wrapper: `onSubmit` prop renamed to `submitHandler`; `position`/`hidden` props removed.
  - `init()` now throws when `voice.devOnlyToken` is set on a non-local origin (as documented).
  - Stealth mode no longer prompts for a reviewer name at page load — identity defers to first activation.
  - The comment popup now has an explicit **Save** button (plus Cmd/Ctrl+Enter) instead of auto-save; **Escape or clicking outside dismisses** without saving, and dismissing a comment whose saved text is still empty deletes it (no orphan pins from accidental gestures).

  **Fixed:**
  - Microphone is released when capture setup fails partway (e.g. host CSP blocks `blob:` worklets).
  - Default token fetch no longer throws "Illegal invocation" (detached `fetch` receiver).
  - `init()` no longer crashes hosts that block localStorage — falls back to in-memory storage.
  - Deepgram socket close is handled: keepalive cleared, session degrades, open has a 10s timeout; `finalize()` resolves on the `from_finalize` ack instead of a blind 300ms sleep.
  - Deleted comments can no longer be resurrected by a pending debounced save; no storage writes after `destroy()`.
  - Voice degrade-to-text lands on the route where recording started (frozen route).
  - Audio worklet carries the fractional downsample remainder (44.1 kHz hardware no longer produces off-pitch 14.7 kHz audio).
  - Builder mode no longer re-reads localStorage per scroll frame; anchor resolution is cached across reflow frames.
  - Voice comments now persist `confidence` (minimum across finals) and set `edited: true` on hand-corrected transcripts.

  **Added:**
  - `VoiceConfig.getToken` escape hatch (resolution order: `getToken` → `tokenEndpoint` → `devOnlyToken`).
  - **Reconcile-on-load**: after `source` hydration, local comments absent from the server list are re-announced through `onChange` as `add`s, so transient sync failures self-heal on the next visit (idempotent upserts; see PROTOCOL.md).
  - `config.routeKey?: () => string` + `handle.refreshRoute()`: hosts whose screens change without a URL change (wizards, phased experiences) define their own frame key so pins anchor to — and reset per — the host's notion of a screen.
  - `theme` config: nine design tokens (`fontFamily`, `accent`, `accentContrast`, `surface`, `text`, `textMuted`, `danger`, `radius`, `shadow`) applied as `--pf-*` custom properties so the widget can match the host product's look.
  - `onChange` callback: fires after every persisted comment add/update/delete with the fresh store and the change, for hosts that ingest feedback live.
  - **Feedback lifecycle (v3 schema)**: comments carry team-set `status` (`done`/`declined`) + `resolution` note; resolved pins render muted (✓ / struck) with a frozen read-only popup. `config.source` hydrates comments from a host backend at init (merge: `updatedAt`-wins content, server-owns disposition; no `onChange` echo). `PROTOCOL.md` documents the bring-your-own-backend sync contract.
  - **Collation & submission**: `describeRoute` friendly frame labels in exports; element context (accessible name/role + nearest heading, plus a pin-time computed-style snapshot — background/color/font/radius/bg-image — and image `src`, rendered as `**Computed:**`/`**Image:**` lines so agents know WHAT is pinned, not just where) captured per pin and rendered in markdown; comment ids + dispositions in export headings; `exportJSON` (versioned, machine-readable); `submitTo` guided mailto hand-off; `handle.exportMarkdown()/exportJSON()/downloadExport()` for host-placed submission moments.

  **Bundle sizes (gzipped):** core ESM 12.8 → 9.4 KB, react wrapper 12.9 KB → 313 B, vue wrapper 13.0 KB → 496 B, voice 5.1 → 4.1 KB. ESM/CJS output is now minified; react/vue wrappers resolve the published `pinflow` core instead of bundling their own copy (fixes duplicate-singleton hazard; keep `pinflow` and wrapper versions in lockstep). Size budgets ratcheted to 11/10.5/4.5/1/1 KB.

### Patch Changes

- eb849fc: iOS: stop Safari auto-zoom when the draft popup opens (textarea is 16px on coarse pointers), and stop pinch/scroll gestures from discarding the draft — outside-dismiss now requires a completed single-finger tap (pointerdown + matching pointerup; a second finger or pointercancel aborts).
- 9825570: Production audit hardening (34-finding external review, all resolved):
  - **Export escaping covers every interpolated field** — reviewer names, routes, ids, selectors, resolutions, context, `describeRoute` labels, and bare `\r` are neutralized, not just comment text. Locked by hostile-input tests.
  - **Lifecycle correctness**: source hydration survives SPA navigation; a mid-edit hydration that resolves a comment discards the stale edit; async `onChange`/`onSubmit` rejections are contained; late clipboard results can't resurrect stale panels; nested scroll containers reposition pins; initially-orphaned pins heal (bounded retry) when their element mounts late.
  - **Voice**: startup is abortable (no socket or mic for a torn-down instance); stop/dispose races persist transcripts exactly once; a mid-recording provider error salvages the transcript and releases the mic; the worklet flushes partial buffers on stop and no longer attenuates amplitude at fractional sample-rate ratios.
  - **Storage**: write-probe acquisition (Safari-private read-only stores get the memory shim up front); URI-encoded key components (colon-bearing names cannot alias another namespace) with legacy read fallback; deep numeric anchor validation.
  - **Wrappers**: React function props (`onChange`, `onSubmit`, `source`, `routeKey`, `describeRoute`) delegate to the latest render — no stale closures; `PinflowTheme` exported from the root.
  - **Builder mode is functional**: reviewer checkboxes filter pins; pins open a read-only view with attribution and disposition.
  - **A11y/platform**: pins are real buttons with accessible names; `prefers-reduced-motion` honored; `.root` font stack survives `all:initial` quirks; the export hotkey leaves the chord to the host when pinflow won't act.
  - **Public API**: `routeOf` now strips pinflow params exactly like the default route key (documented behavior).

  Budgets re-ratcheted to the audited actuals: core ESM 13.1 KB, IIFE 13.45 KB, voice 4.45 KB, react wrapper 0.47 KB (gz) — the measured cost of the correctness work above across both certification rounds.

- dbf5496: Vue wrapper: forward the full `PinflowConfig` to `init()`. The `<Annotator>` component previously declared an enumerated props subset, silently dropping `theme`, `source`, `onChange`, `routeKey`, `describeRoute`, and `submitTo` for Vue consumers. All config keys now pass through; `onChange` maps from a new `changeHandler` prop (same rename convention as `submitHandler`, since Vue reserves `on*`-prefixed props for `v-on` listeners). `theme` and `submitTo` are snapshotted at init like the other object props.

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository scaffolding: TypeScript, tsup build (ESM + CJS + IIFE), Vitest, Playwright, Prettier, Changesets, size-limit CI gate at 30KB gzipped.
- v1 spec under `specs/pinflow_v1_spec.md`.
