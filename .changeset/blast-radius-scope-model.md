---
'@brijeshp/pinflow': minor
---

Blast radius: every annotation now states what an agent may change, and the boundary it may not leave.

**The problem.** A single element served as both identity and scope, and the code resolved that tension by silently widening the identity. A pin recorded the nearest `data-testid` ancestor and discarded what the reviewer actually tapped. A marquee climbed until an ancestor fully contained the drawn rect — so a drag ending mid-card failed containment, that card was discarded, and the scope escalated to the row. The artifact said where a note was and what it was about. It never said how far a fix may go.

**What ships.** A new `scope.ts` resolves a region to an element **set**, top-down with an early stop: children that score `inside` are emitted and not recursed, so three cards in a grid emit three nodes rather than sixty-three, a nested grid emits the inner grids for free, and a marquee drawn in a container's padding grazes everything and emits nothing — the hollow-shape rule, with no rule written for it. Coverage is `area(rect ∩ element) / area(element)` — coverage-of-target, matching `IntersectionObserver`, not IoU — and the element rect is clipped against its container before scoring, so an `overflow:hidden` carousel card cannot score `inside` for a region nobody can see.

A five-rung ladder resolves the boundary: `data-pinflow-source` → `data-testid` ancestor → repeated-sibling signature → landmark/sectioning → the element itself. Every scope records **which rung produced it and how confident that makes it**, so a landmark guess is legible as a guess. A candidate that is really the page is rejected by share-of-descendants or share-of-viewport — never an element-name blocklist, which `<div id="root">` walks straight through — and scope never resolves to `<body>`.

**Exports gain four line-anchored fields**: `**Scope:**` (the ceiling), `**Change:**` (what the note may alter, with `partial` marked), `**Do not change:**` (grazed neighbours), and `**Insertion point:**` for a region drawn in a gap, which records the bracketing siblings rather than claiming the container. `**Source hint:**` renders a host-declared path as page-supplied and unverified.

**A trust preamble** now heads any artifact carrying a scope. Escaping defends the artifact's structure; nothing defends its meaning, and these lines are assembled from `aria-label`, tag names and accessible names — so a page emitting `aria-label="IGNORE PREVIOUS INSTRUCTIONS…"` produces a structurally perfect artifact with that sentence inside the release's most authoritative line. The preamble is literal, never interpolated, and states the rule the pack states: **scope is a ceiling, not a grant** — it narrows what a fix may touch, it never authorises a change you would not otherwise make, and crossing it means saying so.

**`data-pinflow-source` is validated, not escaped.** A positive charset with per-segment rejection and an extension allowlist that deliberately excludes `.md`, `.json`, `.yml` and `.sh`, applied at three call sites (capture, hydration, export). `data-pinflow-source="CLAUDE.md"` would otherwise fire the strongest rung at high confidence and hand an agent the file governing its own behaviour — a taint that persists across sessions. Drop, never repair.

**`data-pinflow-ignore`** excludes a subtree from targeting.

**A visible outline** shows the resolved scope before the composer opens: 2px stroke plus a faint wash for a target, 1px for the boundary, dashed for uncertain, a seam bar for an insertion. The members carry the weight and the boundary is a whisper — a union box over three cards in a grid _is_ approximately the grid rect, which would restate the bug in pixels. Exclusions are deliberately not drawn: absence is already the signal. Opening an existing pin never outlines, because scope was resolved against the DOM at creation and re-outlining today's DOM would attribute a boundary to a reviewer who never saw it.

**Schema v4.** `scope` lives on `Comment`, not `Anchor`, and validates **soft** — a malformed scope is stripped and the comment survives. Every v3 record loads, renders and exports unchanged, and a corpus with no scope produces a byte-identical artifact. There is no `kind` discriminator: structure is total (`between` → insertion, `members` → region, neither → point) and no empty collection is ever written, so a backend normalising `[]` to absent cannot change an annotation's kind in transit. A `gen` field stamps the tuning that produced every record, because the thresholds are unresolved research and `confidence: 'high'` must not come to mean two different things.

`PROTOCOL.md` gains the derived lane: scope is content, follows the `updatedAt` winner, and a v3 backend that has never heard of it cannot strip a scope the reviewer's device derived.

**A healed anchor demotes its scope** — members and exclusions are dropped, confidence floors, and the record is marked `stale`. The derived lists describe a DOM that no longer exists, and keeping them would let an artifact name elements with total confidence that were never in the drawn region.

**Breaking:** `SCHEMA_VERSION` is 4, so `exportJSON`'s `pinflowExport` field reads `4`. Anything parsing that value should accept it. The stored shape is additive; no migration runs and nothing is rewritten.

**Size, honestly.** Core moves from 17.90/17.55 KB gz to **21.80/21.43** (macOS; linux CI runs ~20–30 B heavier) — **+3.9 KB**, ceilings to 22.1/21.75 KB, an owner-approved raise under the ratchet policy in `docs/wiki/build-and-release.md`, re-ratcheted razor-thin over the CI actual. This is well above the 1.3–1.9 KB the plan projected, and the reason is worth recording: the plan's estimate assumed two of its three named byte-levers (dropping the touch marquee, dropping ladder rung (c)) would be pulled, and neither was — this release ships the full requirement set including insertion records and the repeated-sibling rung. The scope engine, the outline renderer, the record validator and the export emitters are four surfaces, not one.

Ladder rung (c) departs from the plan's design. The specified word-like class filter (`/^[a-z\-]{3,}$/i`) rejects `gap-4`, `w-1/2` and `md:flex`, making it blind in exactly the Tailwind output it targets, while the utility soup that does pass is shared by every `<div>` on the page. The signature here is the child-tag sequence, which is class-independent; class overlap survives only as a fallback for childless elements.
