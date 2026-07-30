# Core engine

The Pinflow core engine (`src/core/`) is a framework-agnostic annotation layer that wires together gesture input, element anchoring, localStorage persistence, and UI rendering. It powers both reviewer (single-user pin collection) and builder (aggregate view) modes via a singleton lifecycle pattern initiated by `src/core/index.ts` `init()`.

## Module map

**`index.ts`** — Public entry point. Exports `init(config)` → `Handle`, `destroy()`, `routeOf()`, `version`, all types, and the artifact toolkit re-exports from `export.ts`. Manages the singleton instance and coordinates module initialization: resolves reviewer identity, acquires storage, creates the `Annotator`, and sets up route watching. The `Handle` contract (`destroy()`, `refreshRoute()`, `exportJSON()`, `exportMarkdown()`, `downloadExport()`) lets hosts control lifecycle, refresh pins when the logical screen changes without a URL change (frame-per-screen SPAs), and place their own submission moment.

**`types.ts`** — Shared data models and config. Defines `Comment` (the core entity with anchor, modality, metadata, and the server-owned `status`/`resolution` disposition), `ReviewerStore` (per-reviewer corpus), `Anchor` (selectors + fingerprint + position + optional pin-time `context` with accessible name/role/heading, image `src`, and a computed-style micro-snapshot), and `PinflowConfig` (project namespace, sync hooks `onChange`/`source`, optional voice config, theme tokens, `describeRoute`, `submitTo`). Mode is `'reviewer'` (single user) or `'builder'` (aggregate view: reviewer checkboxes filter pins live; pins open a read-only view with attribution + disposition; per-comment editing stays reviewer-side).

**`ui/annotator.ts`** — The state machine that owns all user interaction (largest file in the repo): pin creation, editing, deletion, panel toggling, export, source hydration, and reflow. Private `_*` members are mangled by the build. Core methods: `_placeCommentAt()` (gesture→pin), `_renderPins()` (full rebuild), `_repositionPins()` (scroll/resize only), `_ensureIdentity()` (stealth deferred prompt), `_openInput()` (explicit-save text editor; resolved comments open as a frozen read-only view with a muted disposition line), `_startVoiceDot()` (voice recording with generation guard), `_hydrateFromSource()` (fetch `config.source` once at identity resolution, merge, and re-announce local-only/locally-newer comments through `onChange`). Dispositioned pins render muted (theme `textMuted`): done swaps the number for ✓, declined keeps the number struck through; orphaned pins stay gray `#a3a3a3`.

Anytime export ("summon, don't station"): `_syncChip()` — called from `_renderPins()`, the single funnel for every count-changing path — maintains a count chip (`button.chip`, bottom-left, pin visual vocabulary) whenever the reviewer has comments and `_exportUiEnabled()` passes (`exportUi` config: `'auto'` default is off when `source` is set). `_toggleSheet()` summons an anchored export sheet (`_makePanel` reuse, `_panelKind` tracks menu/sheet/confirm so a summon REPLACES other panels), saving any open draft losslessly first (`ActiveInput.save`), and no-ops when nothing remains to export. An open sheet's title tracks the corpus live. The popup's `Export all · n` action and the `⌘/Ctrl+Shift+E` chord (registered at construction, removed on destroy, `repeat`-guarded) route through the same `_toggleSheet()`. `_positionPanel()` anchors to whatever summoned the panel and falls back (control, then the chip's home corner) if the anchor left the DOM mid-flight.

Outside-dismiss of the draft popup and the export sheet (shared `_armOutsideDismiss`, which takes a thunk of exempt containers — the surface itself plus the chip, whose taps must reach their own handlers) requires a COMPLETED single-finger tap: armed on `pointerdown`, fired on the matching `pointerup`, aborted by a second pointer (pinch — including one landing on the popup), `pointercancel` (browser took the gesture: touch scroll, pinch-zoom), or release back inside the popup. The draft textarea is 16px on coarse pointers so iOS Safari never auto-zooms on focus.

**`ui/styles.ts`** — Inline CSS (hand-minified) for the shadow tree. Defines `.root`, `.control` (bottom-right button), `.pin` (numbered badge), `.panel` (info drawer), `.input` (text editor popup), `.drawer` (builder-mode checkbox list). Theme tokens are CSS variables (`--pf-*`) consumed with fallbacks; media queries handle dark mode and mobile.

**`ui/dom.ts`** — Shadow root factory (`createUIRoot()`) that builds the isolated DOM tree and appends to `body` once ready. Provides the `el()` helper for text-only element creation.

**`storage.ts`** — Persistence with schema versioning (`SCHEMA_VERSION = 3`; v1→v2→v3 migration on load). Stores per-reviewer corpora under `pinflow:c:<encodeURIComponent(project)>:<encodeURIComponent(reviewer)>` — components are URI-encoded so colon-bearing names can't alias another namespace; a legacy raw-key read fallback keeps pre-encoding corpora (see `KEY_PREFIX`). Exports `loadStore()`, `saveStore()` (guarded, never throws), `loadAllStores()`, `upsertComment()`, `deleteComment()`, `emptyStore()`, and `mergeComments()` (id-match merge used by source hydration: higher `updatedAt` wins content, incoming server value always wins `status`/`resolution` — including clearing them). Migration coerces v1 records (defaulting modality to `'text'`), validates anchors DEEPLY (finite positionPercent/viewport numbers — no NaN% exports), and drops malformed entries; `normalizeComments` is exported and applied to `source` hydration payloads too; v3 added the optional disposition fields, so v2 stores need no field rewrite.

**`safe-storage.ts`** — Fallback to an in-memory `Map`-backed Storage shim when real localStorage is blocked (third-party embeds, sandboxed iframes, private browsing). `acquireStorage()` runs a WRITE probe (set+remove of a probe key) — Safari-private read-only stores get the shim up front instead of silently losing every comment; failures return `memoryStorage()` (non-persistent for the session).

**`anchor.ts`** — Element-to-pin anchoring. `buildAnchor()` first resolves the click target to the nearest ancestor with a non-empty `data-testid` (private `anchorTarget()`; the raw target is used when no ancestor is anchored) so nested labels/icons inside an anchored control never lose the host's test-id contract, then captures selectors + fingerprint + click-to-percentage offset — all measured on that anchored element, plus the pin-time `context`: accessible name (image `alt` included, capped at 80), role, nearest heading, truncated image `src`, and a computed-style micro-snapshot of what feedback is usually about (background, color, font, radius; defaults omitted). `resolveAnchor()` re-finds the element on re-render via the selector ladder. `anchorToScreen()` converts percentage offsets back to viewport coords. `currentViewport()` records dimensions for orphan fallback.

**`selector.ts`** — Selector generation and resolution. `buildSelectors()` produces `SelectorCandidates` (testid, id, css, xpath). The CSS path uses `nth-of-type()` and filters framework-generated IDs (React `useId`, Radix, auto-hashed tokens). `getTextFingerprint()` returns the first 80 chars, whitespace-collapsed. `findByCandidates()` implements the ladder (testid → id → CSS → XPath → fingerprint walk, capped at 2000 elements).

**`router.ts`** — SPA route watching via `history.pushState`/`replaceState` patching plus popstate/hashchange listeners. `watchRoute()` emits onChange only when the route actually changed and guards against orphaned callbacks.

**`route-key.ts`** — Strips pinflow-internal URL params (`reviewer`, `mode`) before deriving the logical screen key, so comments anchor to the conceptual route.

**`export.ts`** — Artifact generation for reviewer and builder modes, re-exported from the package entry as a standalone toolkit. `exportReviewer()` groups comments by route with full selector detail; `exportBuilder()` adds reviewer names and a summary; `exportJSON()` emits the versioned machine-readable corpus. Headings carry the comment id and a disposition suffix; a host `describeRoute` turns `## Route: <key>` into a friendly title with the stable key in backticks beneath. Per-comment lines include **Context:** (accessible name/role/nearest heading), **Computed:** (pin-time style snapshot), **Image:** (truncated src), and **Resolution:** (team note) when present. Orphaned comments are segregated but KEEP their context/computed/image lines — the last-known visual state is exactly what remains when the element is gone. `exportFilename()` timestamps output (`pinflow-feedback-[reviewer-]project-timestamp.md`).

**`gesture/controller.ts`** — Stealth gesture recognizer (long-press on touch, Alt+click on desktop). Runs in capture phase with swallow-timing so host click handlers don't fire. Active only in `'stealth'`/`'both'` activation modes.

**`iife.ts`** — CDN auto-init shim. Reads `<script data-project="..." data-activation="...">` and calls `init()` after DOMContentLoaded.

## Data flow

**Gesture → pin creation:** click (or long-press via `GestureController`) → `_placeCommentAt()` → `buildAnchor()` resolves the nearest `data-testid` ancestor and captures candidates, fingerprint, viewport, percentage offset from it. With voice configured, `_startVoiceDot()` lazy-loads the voice module and starts a session; otherwise `_commitTextComment()` runs immediately with empty text and `openForEdit=true` to show the editor.

**Text input → persistence:** the `.input` popup saves on Save click or Cmd/Ctrl+Enter. Saving calls `upsertComment()` then `_persist()` → `saveStore()`. Empty comments are auto-deleted on dismiss. `onChange` fires after persist.

**Voice → persistence:** the voice module streams interim/final text and emits `commit(text, meta)` when done. `_buildVoiceHost()` supplies the callback that calls `_commitTextComment()` with a **frozen route** (captured at dot creation, not commit time, to survive route changes mid-recording). Voice failures degrade to text via `degradeToText()`.

**Route change:** `watchRoute()` fires → `_generation` bumps → in-flight voice stops and persists to its frozen route → the open draft popup closes → `_renderPins()` clears both caches and renders pins for the new route.

**Source hydration (read half of PROTOCOL.md):** when reviewer identity resolves (init, or first stealth gesture), `config.source()` is fetched once (synchronous throws contained, payload normalized like localStorage) and merged via `mergeComments()`. The fetch is guarded by destruction/identity, NOT the route generation — SPA navigation mid-fetch keeps the corpus. A comment resolved by hydration while its editor is open discards the stale edit at Save. Local comments the server lacks — or has stale (`updatedAt` older than local) — are re-announced through `onChange` as add/update, so transient sync losses self-heal (reconcile-on-load). Hydration-applied changes themselves never emit `onChange` (echoing the host's own data back would loop). Rejection is a dev-visible warn; localStorage stays authoritative.

**Reflow (scroll/resize):** rAF-throttled `_repositionPins()` reuses cached anchors and moves existing pin elements only — no DOM churn. Scroll is observed at the DOCUMENT capture phase so nested overflow containers reposition pins too. Orphaned (null-cached) anchors retry the selector ladder at most every 500ms, so late-mounting elements heal without per-frame cost.

**Visibility filtering:** `_visibleComments()` filters by current route; reviewer mode shows only the current reviewer's comments; builder mode flattens all reviewers on the route. Memoized; cache cleared on data mutation or route change.

## Annotator widget internals

**Shadow DOM structure** (host element carries `data-pinflow-root`): `<style>`, `.root` (fixed full-viewport, pointer-events:none), `.control` button, numbered `.pin` badges (position:fixed), `.panel`, `.input`, builder `.drawer`, and a voice-dot mount.

**Lifecycle:**

1. Constructor: create shadow root, apply theme, render control, render initial pins, start gesture watcher.
2. `refreshRoute()`: bump generation, stop in-flight voice, close inputs, re-render pins.
3. `destroy()`: stop gesture, tear down voice, close inputs, remove listeners, clear shadow tree, set `_destroyed=true` so late async callbacks self-cancel.

**Rendering strategy:** `_renderPins()` fully rebuilds pin DOM (resolve each anchor, create badges, cache resolved elements); `_repositionPins()` only updates screen positions during reflow. A stale element that left the DOM is re-resolved once; orphaned entries park at their last-known percentage position.

**Theme application:** the constructor's `_applyTheme()` sets `--pf-*` custom properties on the shadow **host element**, and `styles.ts` consumes `--pf-font-family` on `.root` rather than `:host` (see the comment in `src/core/ui/styles.ts` for the browser quirk). All tokens optional; omission keeps the stock design.

**Generation guard / destroyed flag:** `_generation` increments on `refreshRoute()`/`destroy()`; in-flight voice loads check `myGen !== this._generation` and cancel. Late callbacks check `_destroyed` and no-op, preventing DOM writes and storage mutations after teardown.

## Storage behavior

- **Schema:** `schemaVersion: 3` (`SCHEMA_VERSION` in `src/core/storage.ts`). v1 records (no modality) migrate on load with `modality='text'`; v3 added optional `status`/`resolution`, so v2 records pass through unchanged.
- **Validation:** `normalizeComments()` drops entries with missing `id`, malformed `anchor`, or invalid selector shapes; coerces text/route/createdAt to strings.
- **Blocked access:** SecurityError on read → in-memory shim; comments last the session only; a single console.warn on first write failure.
- **Forward tolerance:** `migrate()` reads hypothetical v3+ stable core fields; foreign data (missing reviewer/project/schemaVersion) is discarded.

## Export format

Reviewer export shape:

```
# Feedback for <project> — from <reviewer>
Generated: <timestamp>
[comment count, routes covered]
---
## <describeRoute label (stable key in backticks beneath), or `Route: /path`>
### [<comment id>] Comment 1 — <reviewer>, <createdAt> — done|declined (suffix only when dispositioned)
**Element:** <button data-testid="..."> ("fingerprint")
**Context:** the 'Continue' button under 'Next section'
**Computed:** background rgb(…), text rgb(…), font 17px DM Sans, radius 14px
**Image:** https://… (image pins only)
**Selector candidates:** testid / css / xpath as inline code
**Position:** X% from left, Y% from top of element
**Viewport at time of comment:** 390×844 (mobile)
**Resolution:** <team note, when present>
> comment text, blockquoted
```

Builder export adds a summary table (total, by reviewer, by route) and reviewer names per comment. Orphaned comments get their own section with last-known selectors. **Every interpolated field is untrusted** — comment text (blockquote-continued incl. bare `\r`), reviewer names, routes, ids, selectors, resolutions, context, and `describeRoute` labels are all newline-collapsed and code-span-safe so no field can fabricate top-level markdown or instructions when the artifact is pasted into a coding agent. Never weaken this escaping.

## Key internal conventions

- **`_` prefix = private + mangled** (tsup `/^_/`). Renaming `_` members changes minified output; treat as semantic.
- **Singleton:** module-level `current` handle; `init()` during an active instance warns and destroys the old one.
- **`onChange`:** fires after every persisted add/update/delete; host exceptions caught and logged; builder-mode "Clear all" does not emit.
- **Deferred identity (stealth):** `_ensureIdentity()` prompts on first pin attempt, not at init; declining leaves the layer dormant until the next gesture.

## Scope note

`specs/pinflow_v1_spec.md` defers voice to v2, but voice is fully implemented (`VoiceConfig`, `Modality='voice'`, `_startVoiceDot()`); it arrived via `docs/plans/2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md`. The code is authoritative.
