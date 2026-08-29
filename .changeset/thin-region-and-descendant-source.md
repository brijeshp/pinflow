---
'@brijeshp/pinflow': minor
---

Two scope fixes found by auditing a real seven-note export, plus the tuning generation bump they require.

**A marquee drawn across oversized content is a change set, not a gap.** Coverage is scored against each element's own area, so a rect small relative to everything it crosses cleared no floor and left the member list empty — which the insertion path read as "the reviewer drew a gap". A hero note reading _"Copy needs work"_ came back with no change list at all, the `<h1>` it was about published under **Do not change**, and an insertion point asserted inside a container holding three elements. Whether anything was grazed cannot be the test, because a rect that clips a paragraph and sits 90% in the gap really is an insertion; the drawn region is now measured from the other side, and a grazed set that fills it is promoted to the change list. Promoted members are banded `partial` and confidence drops one step, since nothing cleared the ambiguity floor.

**The source hint survives a layout wrapper.** The ancestor climb loses the attribute whenever the wrapper sits outside the annotated component (`<div class="wrap"><Hero/></div>`). When the climb finds nothing, the boundary's descendants are consulted and used only if there is exactly one candidate — two would be a coin flip, and a hint naming the wrong file is worse than none. The rung is never promoted by this path.

`SCOPE_GEN` moves to 3. Records captured under older tuning still hydrate and now render as `— older tuning`.
