---
'@brijeshp/pinflow': patch
---

A drawn region now names the element it was drawn **around**, not the box that happened to contain the reviewer's rect.

**Containment is a cliff, and the anchor was riding it.** A marquee's container is the smallest ancestor whose box fully encloses the drawn rect. That test has no tolerance: a rect aimed at a status badge but drawn fifteen pixels past its header's bottom edge finds nothing below the page shell, because nothing smaller contains both the badge and the sliver of the next section. The boundary escalating is defensible — it is a ceiling, and a loose draw earns a loose ceiling. The anchor following it was not. `buildAnchor` was handed that container, so `**Element:**`, `**Context:**`, `**Computed:**`, all three `**Selector candidates:**` and `**Position:**` all described a page-level `<div>` the reviewer never pointed at, and `**Area:**` was measured against it — reporting a badge-sized rect as "11% × 6%" of the shell.

Every one of those fields was accurate about the container and useless about the note. The artifact led with six of them and printed the field that was still right — `**Change:**`, naming the badge — eighth. A reader following the block in order was walked away from the answer before reaching it, with only `confidence: low` on the seventh line as a signal, and nothing saying that a loose boundary also taints the identification above it.

**The walk does not have that failure mode.** Coverage is scored per element against its own area, so the same badge scored as the sole member in both the tight draw and the overhanging one. The region walk already knew what the note was about while the containment climb was three levels away. So when the walk resolves exactly one member, the anchor is now that member: `Element`, `Context`, `Position` and the selectors all name it, and `areaPercent` is measured against it (clamping to full coverage when the rect engulfs it, which is the honest reading — the reviewer drew across the whole thing).

A region covering **several** members keeps the container. A set has no single subject, and the common ancestor is the honest answer for one. The **boundary is never re-derived** on either path: it answers "how far may a fix reach", and an overhanging draw does not make that answer wrong, only loose — so the ceiling stays exactly as wide as the reviewer drew it while the subject becomes precise.

`areaPercent` moved to the commit path with the anchor it is measured against, so the two can no longer disagree about which box they describe. Net cost 30 B gz (IIFE) / 20 B (ESM); both ceilings unchanged.
