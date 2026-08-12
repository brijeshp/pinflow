---
'@brijeshp/pinflow': patch
---

Coarse-container anchors no longer produce misleading exports.

A reviewer pinning empty space, or dragging a marquee across sibling elements, anchors to a page-level container — there is genuinely nothing tighter under the cursor, and a rect spanning siblings has no tight common ancestor. That part is correct and unchanged. What was wrong is everything the export then said about it: the quoted preview was the container's first 80 characters, which on a long page describes a completely different screen, and an agent reading it in good faith edits the wrong thing.

- **`**Element:**` shows the real tag.** An id-anchored element's css path is bare `#main`, which carries no tag segment, so the label rendered the literal `<element id="main">` — not an HTML tag, and a false grep target. The tag is now recovered from the xpath's last step.
- **A truncated preview says so.** A fingerprint that hit the 80-char cap now ends `…`, so it no longer reads as the element's complete text.
- **`**Area covers:**` names what the rect was drawn over.** Area comments record up to three labels of the blocks the drawn rect actually sampled, via the new optional `Anchor.covers`. The comment still anchors to the containing ancestor, so persistence, healing, reflow and footprints are untouched — this only names what the ancestor's own text cannot.
- **`**Context:**`gains its`under '…'` clause on area comments.** The nearest heading is now taken from the block under the rect rather than from the climbed container, which typically has no heading above it at all. Only the heading moves; selectors, fingerprint, name, role and styles still describe the anchored element, so the block cannot contradict itself.
- **A malformed `textFingerprint` no longer discards the whole store.** `null`/absent passed validation and was then dereferenced during hydration, throwing a `TypeError` that took every other comment with it. Such a record is now dropped on its own.
- **The agent pack teaches the container case** — the only part of this release that helps comments already exported.

Deliberately not done: refusing or redirecting a pin. A predicate that rejects a legitimate full-page pin (a single-screen app where the pinnable thing really is the whole page) would be worse than the bug; a regression test pins that behaviour.

Known limitation: the three samples run down the rect's diagonal, so a marquee over a 2x2 grid can miss the anti-diagonal members. Per-candidate area-ratio scoring would fix it and did not fit the budget.

**Size:** core grows ~210 B gz (IIFE 17.89 -> 18.10 KB local). Ceilings notch to 18.4 / 18.05 KB, an owner-approved trade per the budget policy in `AGENTS.md`, and are re-ratcheted razor-thin over the linux CI actual before this merges.
