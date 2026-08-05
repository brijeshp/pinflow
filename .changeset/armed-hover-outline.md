---
'@brijeshp/pinflow': minor
---

Armed-mode hover outline: while annotate mode is armed (crosshair active), the element under the cursor is highlighted with a non-interactive accent outline (2px `--pf-accent` border + faint accent wash) rendered inside pinflow's shadow root — host element styles/classes are never touched. The outline skips pinflow's own UI, disappears on disarm/pin placement/Escape, and drops its transition under `prefers-reduced-motion`. The pointermove listener is attached only while armed (rAF-throttled; zero work at rest). This is the 80% answer to the area-feedback request; full marquee selection is deferred to 0.5.0.

Size note: core budgets notched for the feature's real cost (~160 B gz) — core IIFE 14.55 → 14.75 KB, core ESM 14.2 → 14.4 KB.
