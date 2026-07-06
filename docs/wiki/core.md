# Core engine

The Pinflow core engine (`src/core/`) is a framework-agnostic annotation layer that wires together gesture input, element anchoring, localStorage persistence, and UI rendering. It powers both reviewer (single-user pin collection) and builder (aggregate view) modes via a singleton lifecycle pattern initiated by `src/core/index.ts` `init()`.

## Module map

**`index.ts`** — Public entry point. Exports `init(config)` → `Handle`, `destroy()`, `routeOf()`, `version`, and all types. Manages the singleton instance and coordinates module initialization: resolves reviewer identity, acquires storage, creates the `Annotator`, and sets up route watching. The `Handle` contract (`destroy()`, `refreshRoute()`) lets hosts control lifecycle and refresh pins when the logical screen changes without a URL change (frame-per-screen SPAs).

**`types.ts`** — Shared data models and config. Defines `Comment` (the core entity with anchor, modality, metadata), `ReviewerStore` (per-reviewer corpus), `Anchor` (selectors + fingerprint + position), and `PinflowConfig` (project namespace, optional voice config, theme tokens, callbacks). Mode is `'reviewer'` (single user) or `'builder'` (aggregate all users).

**`ui/annotator.ts`** — The state machine that owns all user interaction (largest file in the repo): pin creation, editing, deletion, panel toggling, export, and reflow. Private `_*` members are mangled by the build. Core methods: `_placeCommentAt()` (gesture→pin), `_renderPins()` (full rebuild), `_repositionPins()` (scroll/resize only), `_ensureIdentity()` (stealth deferred prompt), `_openInput()` (explicit-save text editor), `_startVoiceDot()` (voice recording with generation guard).

**`ui/styles.ts`** — Inline CSS (hand-minified) for the shadow tree. Defines `.root`, `.control` (bottom-right button), `.pin` (numbered badge), `.panel` (info drawer), `.input` (text editor popup), `.drawer` (builder-mode checkbox list). Theme tokens are CSS variables (`--pf-*`) consumed with fallbacks; media queries handle dark mode and mobile.

**`ui/dom.ts`** — Shadow root factory (`createUIRoot()`) that builds the isolated DOM tree and appends to `body` once ready. Provides the `el()` helper for text-only element creation.

**`storage.ts`** — Persistence with schema versioning (v1→v2 migration). Stores per-reviewer corpora under `pinflow:c:<project>:<reviewer>` (see `KEY_PREFIX`). Exports `loadStore()`, `saveStore()` (guarded, never throws), `loadAllStores()`, `upsertComment()`, `deleteComment()`, `emptyStore()`. Migration coerces v1 records to v2 (defaulting modality to `'text'`) and drops malformed entries via anchor validation.

**`safe-storage.ts`** — Fallback to an in-memory `Map`-backed Storage shim when real localStorage is blocked (third-party embeds, sandboxed iframes, private browsing). `acquireStorage()` tries a read first; on SecurityError returns `memoryStorage()` (non-persistent for the session).

**`anchor.ts`** — Element-to-pin anchoring. `buildAnchor()` captures selectors + fingerprint + click-to-percentage offset. `resolveAnchor()` re-finds the element on re-render via the selector ladder. `anchorToScreen()` converts percentage offsets back to viewport coords. `currentViewport()` records dimensions for orphan fallback.

**`selector.ts`** — Selector generation and resolution. `buildSelectors()` produces `SelectorCandidates` (testid, id, css, xpath). The CSS path uses `nth-of-type()` and filters framework-generated IDs (React `useId`, Radix, auto-hashed tokens). `getTextFingerprint()` returns the first 80 chars, whitespace-collapsed. `findByCandidates()` implements the ladder (testid → id → CSS → XPath → fingerprint walk, capped at 2000 elements).

**`router.ts`** — SPA route watching via `history.pushState`/`replaceState` patching plus popstate/hashchange listeners. `watchRoute()` emits onChange only when the route actually changed and guards against orphaned callbacks.

**`route-key.ts`** — Strips pinflow-internal URL params (`reviewer`, `mode`) before deriving the logical screen key, so comments anchor to the conceptual route.

**`export.ts`** — Markdown generation for reviewer and builder modes. `exportReviewer()` groups comments by route with full selector detail; `exportBuilder()` adds reviewer names and a summary. Orphaned comments are segregated with last-known selectors. `exportFilename()` timestamps output (`pinflow-feedback-[reviewer-]project-timestamp.md`).

**`gesture/controller.ts`** — Stealth gesture recognizer (long-press on touch, Alt+click on desktop). Runs in capture phase with swallow-timing so host click handlers don't fire. Active only in `'stealth'`/`'both'` activation modes.

**`iife.ts`** — CDN auto-init shim. Reads `<script data-project="..." data-activation="...">` and calls `init()` after DOMContentLoaded.

## Data flow

**Gesture → pin creation:** click (or long-press via `GestureController`) → `_placeCommentAt()` → `buildAnchor()` captures candidates, fingerprint, viewport, percentage offset. With voice configured, `_startVoiceDot()` lazy-loads the voice module and starts a session; otherwise `_commitTextComment()` runs immediately with empty text and `openForEdit=true` to show the editor.

**Text input → persistence:** the `.input` popup saves on Save click or Cmd/Ctrl+Enter. Saving calls `upsertComment()` then `_persist()` → `saveStore()`. Empty comments are auto-deleted on dismiss. `onChange` fires after persist.

**Voice → persistence:** the voice module streams interim/final text and emits `commit(text, meta)` when done. `_buildVoiceHost()` supplies the callback that calls `_commitTextComment()` with a **frozen route** (captured at dot creation, not commit time, to survive route changes mid-recording). Voice failures degrade to text via `degradeToText()`.

**Route change:** `watchRoute()` fires → `_generation` bumps → in-flight voice stops and persists to its frozen route → `_renderPins()` clears both caches and renders pins for the new route.

**Reflow (scroll/resize):** rAF-throttled `_repositionPins()` reuses cached anchors and moves existing pin elements only — no DOM churn, caches NOT invalidated.

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

- **Schema:** `schemaVersion: 2`. v1 records (no modality) migrate on load with `modality='text'`.
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
## Route: /path
### Comment 1 — <reviewer>, <createdAt>
**Element:** <button data-testid="..."> ("fingerprint")
**Selector candidates:** testid / css / xpath as inline code
**Position:** X% from left, Y% from top of element
**Viewport at time of comment:** 390×844 (mobile)
> comment text, blockquoted
```

Builder export adds a summary table (total, by reviewer, by route) and reviewer names per comment. Orphaned comments get their own section with last-known selectors. **Comment text is the only untrusted content**: newlines are rewritten as blockquote continuations (`\n> `) so user text cannot escape the quote and masquerade as instructions when pasted into a coding agent. Never weaken this escaping.

## Key internal conventions

- **`_` prefix = private + mangled** (tsup `/^_/`). Renaming `_` members changes minified output; treat as semantic.
- **Singleton:** module-level `current` handle; `init()` during an active instance warns and destroys the old one.
- **`onChange`:** fires after every persisted add/update/delete; host exceptions caught and logged; builder-mode "Clear all" does not emit.
- **Deferred identity (stealth):** `_ensureIdentity()` prompts on first pin attempt, not at init; declining leaves the layer dormant until the next gesture.

## Scope note

`specs/pinflow_v1_spec.md` defers voice to v2, but voice is fully implemented (`VoiceConfig`, `Modality='voice'`, `_startVoiceDot()`); it arrived via `docs/plans/2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md`. The code is authoritative.
