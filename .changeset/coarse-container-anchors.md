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

Known limitations, both accepted deliberately: the three samples run down the rect's diagonal, so a marquee over a 2x2 grid can miss the anti-diagonal members (per-candidate area-ratio scoring would fix it and did not fit the budget); and the trailing ellipsis on a text preview means "80 characters or more", not "provably truncated" — only the capped representation is stored, so text of exactly 80 characters carries it too. Recording real truncation provenance would need a persisted flag, which is new schema surface and bundle bytes for a rare boundary whose worst case is an agent believing there is slightly more text than there is.

**Size:** core grows ~210 B gz. Ceilings notch to **18.18 KB IIFE / 17.83 KB ESM**, set from the linux CI actuals (18.13 / 17.78) with the ~50 B margin the budget policy in `AGENTS.md` calls razor-thin — an owner-approved trade, not a drift.
