---
'@brijeshp/pinflow': patch
---

`**Area covers:**` now names the block a sample lands in, and the bundle drops ~300 B.

An area sample was pushed unclamped, so one landing mid-sentence quoted an inline fragment — and on a page that is _about_ feedback, that fragment reads like reviewer prose inside the artifact, which is the exact confusion the field exists to prevent. The clamp was deferred in 0.9.0 because the budget had room for it or the `N of M` sibling note but not both; that note prevents a wrong edit, this prevents a confusing quote, so it waited.

It no longer has to. 0.9.0's builder-mode removal left `_openBuilderView` and `_builderHidden` behind — declared, zero call sites, shipped — and removing them plus a sweep of behaviour-preserving golf across `export.ts`, `scope.ts`, `selector.ts`, `storage.ts`, `source-path.ts` and the annotator frees ~300 B. The clamp costs ~75 B of that, so both core entries end **below** released 0.9.0 and no ceiling moves up.

Nothing in the artifact changes shape: same fields, same contract. A sample that already landed on a block behaves exactly as before.
