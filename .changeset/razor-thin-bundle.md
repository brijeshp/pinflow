---
'pinflow': minor
---

Razor-thin bundle overhaul: review remediation, build optimization, and pre-1.0 API corrections.

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
- `config.routeKey?: () => string` + `handle.refreshRoute()`: hosts whose screens change without a URL change (wizards, phased experiences) define their own frame key so pins anchor to — and reset per — the host's notion of a screen.
- `theme` config: nine design tokens (`fontFamily`, `accent`, `accentContrast`, `surface`, `text`, `textMuted`, `danger`, `radius`, `shadow`) applied as `--pf-*` custom properties so the widget can match the host product's look.
- `onChange` callback: fires after every persisted comment add/update/delete with the fresh store and the change, for hosts that ingest feedback live.

**Bundle sizes (gzipped):** core ESM 12.8 → 9.4 KB, react wrapper 12.9 KB → 313 B, vue wrapper 13.0 KB → 496 B, voice 5.1 → 4.1 KB. ESM/CJS output is now minified; react/vue wrappers resolve the published `pinflow` core instead of bundling their own copy (fixes duplicate-singleton hazard; keep `pinflow` and wrapper versions in lockstep). Size budgets ratcheted to 11/10.5/4.5/1/1 KB.
