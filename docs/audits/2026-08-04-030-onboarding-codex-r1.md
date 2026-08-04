Reviewed `main...feat/030-onboarding` at `2a620c3`. Uncommitted working-tree edits were excluded.

## P1 blocker

- `src/core/ui/annotator.ts:201-220, 604-609` — Clear all can resurrect deleted comments when `source()` hydration is pending. Clearing empties the local store and emits deletes, but a previously started source request can subsequently merge its stale snapshot back as server-only comments. On the next initialization, if the server correctly returns empty, reconciliation treats those resurrected local comments as missing remotely and emits `add`, potentially restoring them server-side too. Both Clear all and Export & clear are affected. Fix by recording deletion tombstones/mutation epochs for the hydration request and filtering records deleted after it started; add a deferred-source test that clears before hydration resolves.

## P2 should-fix

- `src/core/selector.ts:172-188` — Same-tag bias is applied before the `0.6` threshold, so the implementation does not actually require Dice ≥0.6. For example, `Cart` versus `Cards` has raw Dice ≈0.57 but becomes ≈0.62 for the same tag and attaches. Tiny fingerprints are worse: `No` versus `Not` scores ≈0.67 from a one-bigram set. Require the raw score to meet the threshold and disable fuzzy matching below a conservative fingerprint length. The tests only cover long prose.

- `src/core/selector.ts:173-188`, `src/core/ui/annotator.ts:462-480` — Container/leaf ties select the first DOM candidate and then silently persist it. If a stable-ID selector such as `#approve` disappears, `tagFromCss()` supplies no tag; a reworded wrapper and its nested button have identical `textContent` scores, so preorder traversal selects the wrapper. Nested elements of the same tag fail similarly. `_persistHeal()` then cements the wrong selector. Prefer the deepest candidate for ancestor/descendant ties, retain an explicit original tag/context signal, and refuse ambiguous heals without a meaningful score margin.

- `src/core/iife.ts:16-19` — `data-activation="toggle"` is ignored. That was harmless while toggle was the default; after this release it silently becomes `both`, so CDN embeds cannot opt out through the existing data-attribute path. Accept all three activation values. There is no IIFE activation test, and `src/core/iife.ts` is excluded from coverage.

- `src/core/ui/annotator.ts:437-446, 1023-1032` — A pin that becomes orphaned after initial rendering is hidden but never receives `data-orphaned`, so the sheet omits it from the unanchored count. Conversely, healing removes the flag without refreshing an already-open sheet title. Synchronize the dataset whenever `_placePin` receives a null/non-null target and refresh the sheet heading after reflow changes orphan status. The new test covers only an orphan present at mount.

- `src/core/ui/annotator.ts:584-615, 687-706` — Clear all’s confirmation transitions leave annotation mode armed. Opening the menu arms immediately; Cancel or Delete all closes the confirmation without calling `_exitAnnotateMode()`. The reviewer’s next ordinary application click is therefore prevented, swallowed, and converted into a new comment—particularly bad immediately after clearing. Disarm when entering/completing the destructive flow, or have Cancel explicitly restore the armed menu. Current tests validate storage only, not cursor/listener state.

## P3 nit

- `src/core/types.ts:103-107, 234-235` — Published declaration JSDoc still says activation defaults to `toggle`, contradicting runtime, README, wiki, and the changeset. Update both comments to `both`.

Static inspection found no new runtime dependency, telemetry, export-escaping change, or core→voice import. The detached-anchor path has an actual Playwright download assertion; its unit test does not itself prove browser download behavior, but I found no concrete regression in the configured path.

VERDICT: CHANGES_REQUESTED