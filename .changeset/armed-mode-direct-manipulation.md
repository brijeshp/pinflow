---
'@brijeshp/pinflow': minor
---

Direct-manipulation annotation: hover outline, drag-to-marquee areas, one-dock chrome, and a unified Alt gesture grammar. The bottom-right control and the reviewer menu panel are gone.

**One bottom-left dock.** The bottom-right control pill is removed. A single dock (bottom-left) holds the whole standing interface: an **arm segment** (`+` arms annotate mode, `×` stops; accent while armed) and the **count chip** (opens the export sheet; appears once comments exist). Builder mode's chip always exists and toggles the drawer. Stealth mode stays chromeless (chip only, when comments exist).

**Element footprints & canonical preview.** Element-anchored (click-placed) comments also footprint the CAPTURED element's bounds with the same marching ants — clicking a card shows exactly what got selected, retroactively for existing comments (render-derived, no schema change). Degenerate anchors (near-viewport boxes like `<body>`) show no footprint. And the armed hover outline now previews the CANONICAL anchor target (the nearest `data-testid` ancestor — what a click will actually store), so preview = capture = footprint.

**Hover outline.** While armed, the element under the cursor is highlighted with a non-interactive accent outline (2px `--pf-accent` border + faint accent wash) rendered inside pinflow's shadow root — host element styles/classes are never touched. Skips pinflow's own UI, disappears on disarm/pin placement/Escape, drops its transition under `prefers-reduced-motion`.

**Drag-to-marquee (area feedback).** While armed: click = point pin, drag past 10px = marquee. The page dims around the drawn box (single `box-shadow` spread — no overlay element). Release resolves the tightest element containing the rect and places a normal element-anchored comment (pin straddling the footprint's top-left corner) carrying the new optional `anchor.areaPercent` `{x,y,w,h}` (percentages of that element). Persistence, healing, orphan handling, and rendering are identical to point comments; exports gain a numbers-only `**Area:**` line. Mouse/pen only — touch drags stay native scrolls. The drag's trailing click is swallowed once so host handlers never see it.

**Area footprints (marching ants).** Every placed area comment keeps a light, persistent footprint of its drawn region on the page: four 1px marching-ant edges plus a faint accent wash, with the numbered pin STRADDLING the region's top-left corner (Figma-style — the region's content stays unoccluded and clickable; `positionPercent` still records the drawn center as provenance). `pointer-events: none` — the host page is never occluded interactively. Footprints ride the same cached-anchor reflow path as pins (zero new listeners), mute with dispositioned comments, hide with orphans and heal with them, render in builder mode, and freeze under `prefers-reduced-motion`.

**Alt gesture grammar (no arming needed).** Alt+click = point pin, Alt+drag = marquee area, long-press = touch point — one grammar, disambiguated by the 10px threshold. Behavior change: Alt+click now activates on **release** (was: on press) so a drag can be told apart; Alt with a non-primary mouse button is ignored (right-click stays the host's).

**Reviewer menu panel removed.** Consequences:

- "Stop" / "Add comment" buttons: gone — click the arm segment or press Escape to disarm.
- "Clear all" (wipe without export): gone — use the sheet's "Export & clear".
- "Send to builder" (`onSubmit`): moved to the export sheet. Hosts pairing `onSubmit` with `source` should set `exportUi: 'always'` so the chip/sheet exists.
- Export & share: unchanged, via the count chip's sheet (or ⌘/Ctrl+Shift+E).

All armed-mode listeners attach on arm and detach on exit; gesture listeners stay press-scoped — zero move-handler work at rest. Size: the entire interaction model (outline + marquee + dock + Alt grammar, net of the deleted pill and panel) measures ~1.15 KB gz (including the review-hardening pass: selection/drag suppression, Escape cancel, de-latch, stray-pointer guards, canonical-anchor area math); core budgets ratcheted to IIFE 16.95 KB / ESM 16.6 KB over post-0.4.1-merge actuals 16.91 / 16.55 (the 0.5.0 interaction model stacks on 0.4.1's CSP/escaping/heal hardening; slight headroom per the linux-CI-actuals policy).
