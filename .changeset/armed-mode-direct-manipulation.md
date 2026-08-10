---
'@brijeshp/pinflow': minor
---

Direct-manipulation annotation: hover outline, drag-to-marquee areas, one-dock chrome, and a unified Alt gesture grammar. The bottom-right control and the reviewer menu panel are gone.

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

**Size (the honest full-release accounting).** Core grows from 0.4.1's 14.92 KB gz IIFE / 14.57 KB ESM to **17.34 / 16.98** — **+2.42 / +2.41 KB (+16%)** for the entire release: the direct-manipulation interaction model (outline, marquee, dock, Alt grammar, footprints — net of the deleted pill and panel), nine rounds of input-ownership hardening, and the independent-review security closeout (non-forgeable export fields, healing hardening, bounded fingerprint work). Ceilings move to **IIFE 17.36 KB / ESM 17 KB**, razor-thin (20 B) over actuals per the linux-CI-actuals policy — a deliberate, owner-approved notch documented here per the budget policy in `AGENTS.md`.
