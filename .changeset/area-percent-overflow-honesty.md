---
'@brijeshp/pinflow': patch
---

A drawn rect that spills past its anchor's left or top edge now reports the coverage it actually has.

**0.11.1 made a latent asymmetry reachable.** `areaPercent` derived its width from the RAW drawn width and clamped only the origin, so overflow past the RIGHT edge clamped correctly while overflow past the LEFT clamped `x` to 0 and kept the full width — storing `{x:0,w:100}` for a rect covering half the element. Honesty depended on which edge the reviewer crossed. It could not fire before 0.11.1, because the anchor was the rect's containing ancestor and containment guarantees no overflow. Re-anchoring to a member the rect spills past made it routine: the export printed "100% × 100% of the element" and the on-page footprint drew a full-element box for a half-covered element. Both endpoints are now clamped and the extent derived from their difference, so the compound bound (`x+w <= 100`) is preserved and the stored rect is the true overlap.

**A walk that ran out of budget no longer counts as proof.** `visit()` abandons the rest of the walk when it exceeds `NODE_CAP`, so a large boundary can emit one member and never reach the others — which the sole-member rule would have read as "one is all there was" and anchored a multi-element region to whichever member came first. The re-anchor now requires a complete walk. The gate is the node-budget overrun specifically, exposed on the non-persisted half of the scope result: the record's own `truncated` would have been the wrong signal, since an `EXCLUDED_CAP` overflow sets it while leaving `members` complete, and gating on that would have dropped the 0.11.1 fix on any region grazing more than twelve elements — which is most of them.

`Anchor.areaPercent`'s doc comment now states which element a marquee anchors to in each case, and that the rect is clamped rather than verbatim — consumers were entitled to assume the anchor contained the rect, and since 0.11.1 it need not.
