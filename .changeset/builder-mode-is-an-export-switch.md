---
'@brijeshp/pinflow': minor
---

Builder mode becomes an export switch instead of a screen.

`mode: 'builder'` used to draw its own chrome: a drawer listing every reviewer with a checkbox, read-only pins for other people's comments, and a Clear all button. That is gone. What remains is the part that was doing the work — `exportMarkdown()`, `exportJSON()` and `downloadExport()` still span **every reviewer store in the browser**, and `exportBuilder()` is still exported for hosts rendering artifacts from their own data.

**Why remove rather than keep.** The drawer aggregated `localStorage`, which means it aggregated one _browser_, never a team — reviewers on other machines were never in it, and the guide already said so ("not an administrative or authenticated area"). A real multi-reviewer tier is backend-shaped and would not be built on that data layer, so the UI was a placeholder that could only ever be rewritten, not extended. Nothing was using it. Keeping it meant maintaining ~600 B of chrome threaded through the annotator's state machine — the file most likely to change — in exchange for option value that does not exist.

The last commit containing it is tagged **`builder-mode-final`**; `git show builder-mode-final:src/core/ui/annotator.ts` retrieves it whenever the paid tier wants to look.

**What this changes for a host.** `init({ mode: 'builder' })` now renders nothing of its own: no chip, no drawer, no foreign pins. Reach the aggregate through the handle. If you were relying on the on-page drawer, that affordance is gone; if you were relying on the aggregate export — the documented purpose — nothing changed.

Budget: −582 B gz IIFE / −593 B ESM. That more than repays the ESM ceiling raise this release took for the artifact-quality fixes, and both entries now sit well below where the release started.
