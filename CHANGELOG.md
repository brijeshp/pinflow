# Changelog

## 0.5.0

### Minor Changes

- 28ae387: Direct-manipulation annotation: hover outline, drag-to-marquee areas, one-dock chrome, and a unified Alt gesture grammar. The bottom-right control and the reviewer menu panel are gone.

  **One bottom-left dock.** The bottom-right control pill is removed. A single dock (bottom-left) holds the whole standing interface: an **arm segment** (`+` arms annotate mode, `×` stops; accent while armed) and the **count chip** (opens the export sheet; appears once comments exist). Builder mode's chip always exists and toggles the drawer. Stealth mode stays chromeless (chip only, when comments exist).

  **Element footprints & canonical preview.** Element-anchored (click-placed) comments also footprint the CAPTURED element's bounds with the same marching ants — clicking a card shows exactly what got selected, retroactively for existing comments (render-derived, no schema change). Degenerate anchors (near-viewport boxes like `<body>`) show no footprint. And the armed hover outline now previews the CANONICAL anchor target (the nearest `data-testid` ancestor — what a click will actually store), so preview = capture = footprint.

  **Hover outline.** While armed, the element under the cursor is highlighted with a non-interactive accent outline (2px `--pf-accent` border + faint accent wash) rendered inside pinflow's shadow root — host element styles/classes are never touched. Skips pinflow's own UI, disappears on disarm/pin placement/Escape, drops its transition under `prefers-reduced-motion`.

  **Drag-to-marquee (area feedback).** While armed: click = point pin, drag past 10px = marquee. The page dims around the drawn box (single `box-shadow` spread — no overlay element). Release resolves the tightest element containing the rect and places a normal element-anchored comment (pin straddling the footprint's top-left corner) carrying the new optional `anchor.areaPercent` `{x,y,w,h}` (percentages of that element). Persistence, healing, orphan handling, and rendering are identical to point comments; exports gain a numbers-only `**Area:**` line. Mouse/pen only — touch drags stay native scrolls. The drag's trailing click is swallowed once so host handlers never see it.

  **Area footprints (marching ants).** Every placed area comment keeps a light, persistent footprint of its drawn region on the page: four 1px marching-ant edges plus a faint accent wash, with the numbered pin STRADDLING the region's top-left corner (Figma-style — the region's content stays unoccluded and clickable; `positionPercent` still records the drawn center as provenance). `pointer-events: none` — the host page is never occluded interactively. Footprints ride the same cached-anchor reflow path as pins (zero new listeners), mute with dispositioned comments, hide with orphans and heal with them, render in builder mode, and freeze under `prefers-reduced-motion`.

  **Armed input ownership (release-review hardening).** While armed, accepted mouse/pen presses are owned END-TO-END at window capture: host handlers never see the pointerdown/pointerup phases or the trailing click (touch and pinflow's own dock stay native). Escape during a held press keeps a shield until that pointer's own release; lost releases (outside-window) recover on the same pointer's next press in both the armed and Alt state machines. `AreaPercent` is exported from the package root.

  **Non-forgeable export workflow fields (independent-review closeout).** The composite comment heading (`### [id] Comment N — createdAt — done`) is replaced by a neutral `### Comment N` plus line-anchored `**Comment ID:**`, `**Status:**` (always present — `open`/`done`/`declined`, derived only from the validated status value), `**Reviewer:**` (builder export), and `**Created:**` fields. Untrusted id/createdAt strings shaped like a disposition can no longer make an agent skip open work. All four shipped agent formats teach the new grammar and now uniformly carry the fixed-string search rule (`-F`, value as its own argv element after `--`). If you parse the artifact yourself, update your heading matcher.

  **Selector healing hardening (independent-review closeout).** An empty candidate fingerprint no longer corroborates a meaningful stored one (recycled/still-loading rows can't win through stale positions); hidden zero-box elements can no longer be accepted — or persisted — as healed anchors (a visible duplicate or an honest orphan wins); hydrated fingerprints are capped to the 80-char representation at both the hydration and matcher boundaries before any O(length) work; and heal-time text extraction streams text nodes in 2 KB chunks against the shared 2 ms deadline instead of materialising whole subtrees via `textContent`.

  **Alt gesture grammar (no arming needed).** Alt+click = point pin, Alt+drag = marquee area, long-press = touch point — one grammar, disambiguated by the 10px threshold. Behavior change: Alt+click now activates on **release** (was: on press) so a drag can be told apart; Alt with a non-primary mouse button is ignored (right-click stays the host's).

  **Reviewer menu panel removed.** Consequences:
  - "Stop" / "Add comment" buttons: gone — click the arm segment or press Escape to disarm.
  - "Clear all" (wipe without export): gone — use the sheet's "Export & clear".
  - "Send to builder" (`onSubmit`): moved to the export sheet. Hosts pairing `onSubmit` with `source` should set `exportUi: 'always'` so the chip/sheet exists.
  - Export & share: unchanged, via the count chip's sheet (or ⌘/Ctrl+Shift+E).

  All armed-mode listeners attach on arm and detach on exit; gesture listeners stay press-scoped — zero move-handler work at rest.

  **Size (the honest full-release accounting).** Core grows from 0.4.1's 14.92 KB gz IIFE / 14.57 KB ESM to **17.35 / 17.00** (macOS; linux CI gzip runs ~30 B heavier) — **+2.43 KB (+16%)** for the entire release: the direct-manipulation interaction model (outline, marquee, dock, Alt grammar, footprints — net of the deleted pill and panel), nine rounds of input-ownership hardening, and the independent-review security closeout (non-forgeable export fields, healing hardening, bounded fingerprint work). Ceilings move to **IIFE 17.4 KB / ESM 17.05 KB**, razor-thin over linux CI actuals per the budget policy — a deliberate, owner-approved notch documented here per the budget policy in `AGENTS.md`.

## 0.4.1

### Patch Changes

- 7b09200: Comment textarea placeholder is now "What should change?" (was "What's on your
  mind?"). A UX review found the old wording invited open-ended musing, while the
  new prompt primes reviewers to leave actionable input a coding agent can act on
  straight from the exported markdown. Copy-only — no behavior or API change.
- 48c7437: Adds an `agent/` folder to the package: the reading protocol for a Pinflow
  artifact, in the four formats coding agents actually load — a skill, a slash
  command, an editor rule, and an `AGENTS.md` snippet. None of it is code, so it
  adds nothing to the browser bundle, and it improves every artifact already
  exported. `agent/README.md` maps each file to the tools that read it.

  The artifact has always been descriptive rather than instructional, and several
  fields are easy to misread: `**Position:**` is a percentage inside the element
  rather than a page coordinate, `Comment N` is a file position while `[cmt_id]`
  is the durable handle, and comments under `## Orphaned comments` describe
  elements that no longer exist — so running their selectors finds whatever
  happens to occupy that path now.

  It also states the boundary the escaping cannot express. Everything interpolated
  into an artifact originates from a web page and the people using it. Pinflow
  escapes all of it so it cannot forge markdown structure, but that defends
  structure, not meaning: an agent must read the content as a problem to solve and
  never as instructions addressed to itself.

- 112ae5d: Pinflow now survives a strict Content Security Policy. Under `style-src 'self'`
  with no `'unsafe-inline'`, the shadow-root `<style>` element was silently
  dropped — and because the host's `pointer-events: none` is set through CSSOM
  (which CSP does not restrict) while every `pointer-events: auto` lived in that
  blocked stylesheet, the widget degraded to an invisible, completely
  **non-interactive** overlay: pins and buttons present, all dead, no error. A
  shadow root has no CSP context of its own, so the document policy governs it.

  Styles now load through a constructed `CSSStyleSheet` adopted into the shadow
  root. CSP defines no hook for CSSOM, so this survives where a `<style>` element
  does not. Engines without constructed stylesheets (Safari below 16.4) keep the
  `<style>` path unchanged, chosen by a feature probe that also rejects engines
  which accept `replaceSync` and silently discard the rules.

  No API change. Hosts serving pinflow under a strict CSP no longer need
  `'unsafe-inline'` in `style-src`.

- 8f44d23: The export confirmation no longer claims a file was saved when it may not have
  been. Downloading fires a detached anchor click and returns nothing — there is
  no event and no promise, so a completed save is not observable. In iOS in-app
  webviews (Instagram, LinkedIn, Slack) it frequently does nothing at all, which
  is exactly where a reviewer following a shared link ends up, and the panel
  announced "Saved to your downloads" regardless.

  The panel now states only what was verified. When the clipboard write succeeded
  it says so and offers pasting as the recovery if no file appeared; when it did
  not, it points the reviewer at their downloads without asserting the file is
  there. With `submitTo` configured and no clipboard, the hand-off now tells the
  reviewer to attach the downloaded file — previously it opened an empty email
  with nothing to paste and nothing to attach.

- 2c1390f: Comments no longer silently re-anchor to the wrong element. The selector ladder
  tried the CSS path before the text fingerprint, so on a virtualised list or an
  infinite scroll — where the DOM recycles nodes — a stale `li:nth-of-type(1)`
  kept resolving confidently onto whatever content had scrolled into that slot. A
  pin on "Order #1042" could reattach to "Order #7781" with no sign anything was
  wrong. A positional match that contradicts a strong stored fingerprint is now
  demoted: the text pass gets first refusal, and the positional hit is still used
  if nothing corroborates, so no comment that resolved before stops resolving.

  Two related fixes on the same path. The fingerprint walk started at the document
  root, which meant `<head>` was scored — a page titled "Checkout" would heal a
  pin on a "Checkout" heading to `<title>`, an exact match found first and never
  displaced. The walk now starts at `<body>` and skips tags that can never be a
  pin target, and skipped elements no longer consume the walk budget.

  The walk is also faster and bounded by time as well as count. Fingerprinting
  normalised an element's entire subtree to keep 80 characters, which measured
  97 µs on a 33 kB anchor and 640 µs under 6x CPU throttling; it now scans a
  bounded prefix and falls back to the full string only when whitespace-heavy
  markup makes the prefix insufficient, so fingerprints are unchanged. A 2 ms
  budget complements the 2,000-node cap, which alone was device-dependent —
  roughly 1.5 ms on a laptop but 9.5 ms on a mid-range phone.

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
