---
'@brijeshp/pinflow': minor
---

Scope hotspots, corrected against a real export — and the bundle golfed to pay for it.

**Where this came from.** Not a review pass: an audit of an actual artifact, five comments a reviewer left on a real page, measured against the bar the scope model was built to clear — can a coding agent act on this file without going back to the reviewer? Four of the five notes cleared it. One failed in a way neither party could see, and the `confidence` field turned out to be **anti-correlated with usefulness**.

**`**Do not change:**` is no longer binding.** It was the most authoritative sentence in the artifact and it made the _weakest_ evidence in the record absolute. An exclusion is a bare coverage ratio against a hand-drawn rectangle — geometry, not intent — while the boundary beside it comes from a real containment test and already carried an explicit override clause. On the audited export that inversion turned a ~1% overhang past a grid gutter into a prohibition on two of the five bullets the reviewer had asked to fix: the artifact forbade the only coherent fix. It now reads as what the region _grazed_, for that note alone, with a deterministic default — prefer leaving them, change one if a coherent fix needs it and say so. "Confirm first" was rejected as a replacement: it has no addressee in a pipeline whose premise is no round-trip.

**A region that slices a repeated set now says so.** `**Change — 2 of 5 `<li>`**` instead of `**Change — 2 element(s)**`. A rect cutting one column of a three-column grid emits some cells as members, the grazed column as exclusions, and an untouched column _nowhere_ — three states, of which the artifact rendered two, so the counts read as a deliberate permission list over a set the reviewer meant whole. The members are deliberately **not** widened to their parent: promoting a partial cover to its container is the exact bug the covered-set model exists to prevent.

**R4 now applies to marquees.** The region branch assigned a rung and published its confidence unchecked, so a marquee resolving to the whole page shipped at `medium` while a tightly-scoped point pin shipped at `low`. Only the share-of-descendants half applies there: the viewport half compares an element's full scroll box against one screen, which on any content page is a "taller than the screen" test — measured at 1.97 viewports for a section holding 18.7% of the document. Reusing it wholesale would have demoted ordinary sections and flattened every note in an export to `low`, and the agent pack tells agents to verify at low confidence, so that manufactures a round-trip per note.

**`**Area covers:**` names the block the sample hit**, not the highest child beneath the containing ancestor. A rect drawn slightly wider than its block used to walk past it and quote a sibling's opening text while `**Position:**` still pointed at the right place — a disagreement nothing in the artifact could reveal.

**Also:** the source hint resolves from an _ancestor_, so host instrumentation reaches marquees whose boundary is a plain wrapper; `text-align` joins the computed snapshot when non-default, because "left align this" is ambiguous between text alignment and un-centring a block; and the exclusion cap and label cap stop truncating in silence.

`SCOPE_GEN` moves to 2 — marquee confidence means something different than it did under gen 1, and `siblings` did not exist. Records written by older builds still hydrate.

**Size.** `treeshake` was missing from the IIFE entry alone, shipping a dead CJS-interop preamble: −191 B. Four duplicated shapes golfed out of the UI and the validators: −87 B more. IIFE ends **below** where it started despite everything above. ESM's ceiling rises as a deliberate, approved trade — the golf freed 278 B there against only 91 B on ESM, and the alternative was dropping the fix that resolves the one proven wrong-edit.

Known limitation, measured and recorded: an area sample is not clamped to its nearest block, so it can quote an inline fragment mid-sentence. Clamping cost 76 B gz and the budget had room for that or the N-of-M note, not both.
