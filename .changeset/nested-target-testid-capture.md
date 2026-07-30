---
'@brijeshp/pinflow': patch
---

Fix nested-target capture: pins now anchor to the nearest `[data-testid]`
ancestor of the click target. Clicking a label span or icon nested inside an
anchored control previously recorded `testid: (none)` and fell back to brittle
css/xpath selectors, defeating host-side test-id contracts. The whole anchor —
selectors, text fingerprint, context, and `positionPercent` — is now built from
the anchored ancestor, so re-pinning stays coherent with the recorded rect.
Empty/whitespace `data-testid` values are skipped, and elements with no
anchored ancestor behave exactly as before.
