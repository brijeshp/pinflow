---
'@brijeshp/pinflow': minor
---

Armed-mode direct manipulation: hover outline + drag-to-marquee, and the reviewer menu panel is gone.

**Hover outline.** While annotate mode is armed, the element under the cursor is highlighted with a non-interactive accent outline (2px `--pf-accent` border + faint accent wash) rendered inside pinflow's shadow root — host element styles/classes are never touched. Skips pinflow's own UI, disappears on disarm/pin placement/Escape, drops its transition under `prefers-reduced-motion`.

**Drag-to-marquee (area feedback).** While armed: click = point pin (unchanged), drag past 10px = marquee. The page dims around the drawn box (single `box-shadow` spread — no overlay element). Release resolves the tightest element containing the rect and places a normal element-anchored comment (pin at the rect's center) carrying the new optional `anchor.areaPercent` `{x,y,w,h}` (percentages of that element). Persistence, healing, orphan handling, and rendering are identical to point comments; exports gain a numbers-only `**Area:**` line. Mouse/pen only — touch drags stay native scrolls. The drag's trailing click is swallowed once so host handlers never see it.

**Reviewer menu panel removed.** The control pill is now a pure arm/disarm toggle (label still carries the count). Consequences:

- "Stop" / "Add comment" buttons: gone — click the pill or press Escape to disarm.
- "Clear all" (wipe without export): gone — use the sheet's "Export & clear".
- "Send to builder" (`onSubmit`): moved to the export sheet. Hosts pairing `onSubmit` with `source` should set `exportUi: 'always'` so the chip/sheet exists.
- Export & share: unchanged, via the count chip's sheet (or ⌘/Ctrl+Shift+E).

All armed-mode listeners (pointermove/down/up/cancel) attach on arm and detach on exit — zero work at rest. Size: measured cost of the whole interaction model is ~660 B gz net of the deleted panel; core budgets notched IIFE 14.55 → 15.25 KB, ESM 14.2 → 14.9 KB (actuals 15.21 / 14.86).
