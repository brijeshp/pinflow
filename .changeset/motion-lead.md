---
'@brijeshp/pinflow': minor
---

Artifacts now name the element that actually animates.

Motion is 23% of real review notes across two measured sessions — "remove the shifting animation", "remove the shaking effect" — and until now the artifact answered them with the wrong elements. A marquee over a tilting code card emitted **seventeen syntax-highlighting spans** as the change set, while the `rotate` lived on the card wrapping all of them; that card appeared in no list at all, and `**Computed:**` said only what colour the text was.

`**Motion:**` names the nearest element at or above the change set whose CSS moves, and **which properties** — never their values. The value is a lie at capture time: the reviewer's pointer is on the element when they release, so a `:hover { rotate: 0deg }` rule computes to `0deg` on a note complaining the thing rotates. A property or keyframes name (`rotate`, `cta-settle`) is a literal token to grep for in source instead.

It is emitted **before** the change list, because on the note that motivated it the culprit is the grandparent of every listed element.

**A lead, not a grant.** It is routinely outside `**Scope:**` — the thing a motion note is about is usually an ancestor of everything the region covered — so editing it can affect siblings the reviewer never pinned. All four agent formats teach that, held in step by a parity test.

**Silent when nothing moves.** A paint-only transition is not motion: a button whose background fades over 0.18s gets no line, and neither does anything under `prefers-reduced-motion`, because the predicate reads computed style rather than the stylesheet. Across the 13 real notes it fires on exactly the 3 that are about motion.

Costs ~282 B gz, which required an owner-approved ceiling raise — there was no offsetting golf left that did not weaken escaping or the storage validators.
