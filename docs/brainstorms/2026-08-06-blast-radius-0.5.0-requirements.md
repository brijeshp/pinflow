---
date: 2026-08-06
topic: blast-radius-0.5.0
---

# Pinflow 0.5.0 — Blast Radius

Source ideation: `docs/ideation/2026-08-06-competitive-response-ideation.md` (idea 0 + survivors 2–7).

> **Superseded in part by planning, 2026-08-06.** This document specified one release; planning split it
> into two after finding that R13, R14 and R12's honesty half touch files the marquee branch never opens
> (`git diff main...claude/peaceful-mclaren-c0d78e` shows `selector.ts` and `ui/dom.ts` untouched), so
> they ship non-breaking as **0.4.1** rather than waiting behind the scope-model sprint.
>
> - **0.4.1** — `docs/plans/2026-08-06-002-fix-csp-heal-export-honesty-plan.md` (R13, R14, R12 honesty, R17 v3)
> - **0.5.0** — `docs/plans/2026-08-06-001-feat-blast-radius-scope-model-plan.md` (R1–R11, R15, R16, R18)
>
> Three requirements below were also corrected during planning and deepening. **R6's collapse rule is
> replaced by top-down traversal with early stop** (the rule as written reproduces the bug the release
> exists to fix). **R7 and R8 both claimed the container** — ancestors of the rect are never banded.
> **R11's `touch-action` mechanism cannot work** — `touch-action` is latched at `touchstart`; the
> working form is a pre-armed non-passive `touchmove` guard. And _"Resolve Before Planning: (none)"_ was
> wrong: flow analysis found eight product decisions filed as technical deferrals. See the plans.

Release: **0.5.0, `feat!:`** — launch deliberately delayed.

## Problem Frame

A Pinflow annotation answers _where is it_ (selector ladder, fingerprint, fuzzy heal) and _what is it
about_ (comment text, computed-style snapshot). It has never answered **how far may you change**.

The consequence is that a single element is asked to serve as both identity and scope, and the code
resolves that tension by silently widening the identity:

- `anchorTarget()` promotes the click target to the nearest `data-testid` ancestor for re-anchor
  stability — a good reason — then **discards the raw target**. The artifact cannot distinguish
  "clicked the price label" from "clicked the pricing card." There is no depth cap and no stop at
  `<body>`, so a `data-testid` on a page wrapper captures every pin on the page.
- The marquee on `claude/peaceful-mclaren-c0d78e` is **a picker, not a multi-select**. It hit-tests
  the rect's centre only, climbs `parentElement` until an ancestor _fully contains_ the rect, and
  writes an ordinary single-element comment. A marquee over three pricing cards records **the grid**;
  the cards are never seen, named, or counted. A drag ending mid-card fails containment, so that card
  is discarded and scope escalates to the row.
- The `**Area:**` line is numbers-only by a deliberate anti-injection choice, which also makes it
  semantically empty — an agent cannot map percentages back to DOM nodes without re-rendering.

So the agent receives an element that is reliably _wider_ than what the reviewer meant, with no
statement of boundary and no exclusions. It over-reaches, and nothing measures that it did.

**Why this is the release's centre of gravity.** react-grab's real insight is not `file:line` — it is
that **a component is a blast radius**, because it is the unit of source editing. Two rivals reach
that by reading React fibers, which do not exist on a production build; all three treat an annotation
as a point. Approximating component boundaries from DOM signals works where Pinflow actually lives —
a deployed URL, a non-technical reviewer, a phone. The exclusion set is the single largest lever on
agent over-reach and no competitor emits one.

Shipping alongside it: six verified defect and hygiene items (R10–R15) that the same sprint must
cover, because several are launch-blocking and two are prerequisites for doing R1–R9 safely.

## Requirements

### Blast radius — the scope model

- **R1.** Every annotation records three distinct things: **target** (what the reviewer pointed at —
  tag, accessible name, own fingerprint; never used for re-anchoring, so heal stability is
  unaffected), **anchor** (today's stable healable element, unchanged), and **scope** (the derived
  edit boundary).
- **R2.** Scope is resolved by a **scope ladder**, strongest rung first: (a) `data-pinflow-source`;
  (b) `data-testid` ancestor; (c) **repeated-sibling signature** — an element with ≥2 siblings sharing
  its tag and a substantially overlapping class-token set is one instance of a repeated component, so
  the component boundary is that element and the list boundary is its parent; (d) landmark,
  sectioning, or heading-bearing container; (e) none — fall back to the anchor element and report low
  confidence.
- **R3.** Scope is always emitted **with the rung that produced it and a confidence level**. An agent
  must be able to tell a `data-pinflow-source` scope from a landmark-fallback scope.
- **R4.** Every rung is subject to a **size sanity check** (descendant count and share of viewport).
  A candidate scope that exceeds it is labelled wide/low-confidence rather than silently accepted.
  **Scope must never resolve to `<body>`** — if the ladder would, it reports the anchor element with
  low confidence instead.
- **R5.** A marquee resolves a **covered set**, not a container. Elements are collected by walking
  down from the resolved container (bounded walk, no document sweep) and scored by
  `coverage = area(rect ∩ element) / area(element)` into three bands: **inside** (high coverage),
  **partial** (ambiguous — recorded and labelled as such), **grazed** (low coverage — excluded).
- **R6.** The covered set is **collapsed to maximal subtrees**: bottom-up, if all of an element's
  element-children are `inside`, they are replaced by the parent. Three cards × twenty descendants
  emits three nodes, not sixty-three. The collapsed set is capped, with a count for the remainder and
  a confidence reduction when the cap is hit.
- **R7.** The grazed set is emitted as **explicit exclusions** — elements the marquee touched but did
  not select, which the agent must not edit to satisfy the note.
- **R8.** A marquee whose `inside` set is empty is an **insertion**, not a failure: it records the
  container, the two siblings bracketing the rect in document order, and the rect's size. A plain pin
  is never reinterpreted as an insertion.
- **R9.** `**Scope:**` is **binding with a declared escape hatch**. The artifact and the agent pack
  instruct: change what is inside Scope; if a correct fix demonstrably requires editing outside it,
  make the change and state which boundary was crossed and why. Exclusions are never edited to satisfy
  a note.

### Reviewer-facing behaviour

- **R10.** The resolved scope is **outlined on the page** at pin and marquee time, before the composer
  opens, so the reviewer sees exactly what they are annotating. The outline is **not adjustable** — a
  reviewer who disagrees redraws. Low-confidence scopes are visually distinguishable from confident
  ones.
- **R11.** **Marquee works on touch** via long-press-then-drag: once the 500 ms press has fired, intent
  is committed, so continued movement draws a marquee instead of cancelling the press.
  `touch-action` suppression is scoped to that one live gesture and restored in the single teardown —
  never applied to `<body>` for the duration of armed mode.
- **R12.** **No export path claims success it did not achieve.** The confirmation panel must not assert
  "Saved to your downloads" when the download no-opped; a failed persistence write must surface to the
  reviewer rather than a console they will never see; and a last-resort copy surface must exist when
  both download and clipboard fail.

### Reliability and structural

- **R13.** The widget **renders and remains interactive under a strict `style-src 'self'` CSP**.
  (Today the shadow-root `<style>` is blocked, and because `pointer-events: auto` lives only in that
  stylesheet, the failure is a silent, fully non-interactive overlay.)
- **R14.** **A wrong re-anchor never silently wins over an honest orphan.** Specifically: a positional
  (css/xpath) match that contradicts a strong stored text fingerprint is rejected; the fingerprint walk
  is seeded near the pin rather than at the document root; and the walk is time-bounded, not only
  count-bounded.
- **R15.** **Armed state has exactly one owner and one idempotent teardown**, invoked unconditionally
  from a single choke point, with a test asserting that no Pinflow document-level listener survives any
  surface transition. Annotate mode is retained (deleting it removes `toggle` mode's only placement
  path).
- **R16.** `data-pinflow-ignore` excludes a subtree from annotation targeting; `data-pinflow-source`
  supplies a host-declared source path. Because the latter is page-author-controlled text rendered into
  an artifact as a path an agent will open, it is **validated against a format whitelist**, not merely
  escaped.
- **R17.** An **agent pack** ships in the npm tarball (skill, slash command, editor rules, AGENTS
  snippet) carrying the reading protocol — scope authority per R9, selector-ladder precedence, position
  semantics, orphan handling, and the instruction that reviewer prose is untrusted data.

## Success Criteria

- A marquee over N sibling cards names **the N cards**, not their container — verified on a real grid.
- No annotation, by any path, resolves scope to `<body>`.
- An agent acting on an export **stays inside Scope** for the large majority of notes, and when it
  crosses a boundary it says so — making over-reach visible for the first time.
- The recorded bar holds or improves: the artifact lets Claude Code/Codex locate and propose a fix for
  ≥80% of notes without human disambiguation.
- A reviewer on a phone, on a deployed URL, can select a region and place an insertion note.
- The widget is fully interactive on a page served with `style-src 'self'` and no `'unsafe-inline'`.
- A reviewer never receives a success message for an export that did not happen.
- The virtualised-list case (recycled DOM node satisfying a stale `nth-of-type`) produces an orphan
  rather than a confidently wrong element.
- No armed-mode leak survives any surface transition, enforced by test rather than by review.
- Core lands at or under the ratcheted ceiling, with the golf pass done inside the sprint.

## Scope Boundaries

Deliberate non-goals for 0.5.0:

- **No scope adjustment UI.** The outline is informational; disagreement is expressed by redrawing.
- **No fiber reads.** React 19 removed `_debugSource` and all `_debug*` fields are DEV-only, so a
  fiber walk returns nothing usable on the production deploys Pinflow targets.
- **No screenshots.** Rejected twice; agentation independently reached the same text-only conclusion.
- **No severity, priority, labels, or an intent enum.** Out of scope per the v1 spec and unchanged.
- **No MCP server, no CLI, no share-link, no multi-reviewer collation, no two-way agent questions.**
  All are post-0.5.0; several are paid-tier line items and must not be given away here.
- **Anonymous-by-default identity is deferred**, not dropped — revisit before the site ships.
- **No threading, replies, or mentions.**
- **No hosted backend.**

## Key Decisions

- **Scope is visible but not adjustable** — the reviewer sees the outline before the composer opens.
  Rationale: an invisible derivation that silently picks the wrong ancestor is the current bug with
  more steps, but an adjustment control adds an interactive state to the exact gesture that produced
  twelve armed-mode findings across four review rounds.
- **Touch marquee ships**, via long-press-then-drag. Rationale: the moat is a non-technical reviewer on
  a phone; a blast-radius model that only desktop reviewers can draw concedes precisely the limitation
  Pinflow claims to beat. Acknowledged as the sprint's single largest risk.
- **Budget ratchets to ~18 KB gz, with byte-golf as an acceptance criterion rather than a follow-up.**
  Rationale: "14 KB" is a marketing figure, not a platform threshold; what a platform asks is whether
  the bundle is small and auditable. agentation's <15 KB buys a React-only, desktop-only, fiber-
  dependent tool.
- **Scope is binding with a declared escape hatch.** Rationale: strictly binding means one mis-resolved
  scope silently blocks a correct fix and nobody learns why; advisory makes it a prettier `**Element:**`
  line that changes no behaviour. The escape hatch doubles as a signal — an agent reporting a boundary
  crossing is telling you the ladder got it wrong.
- **Release as 0.5.0, `feat!:`.** The branch alone already removes the reviewer menu panel, the control
  pill, "Stop"/"Add comment" and standalone "Clear all"; moves `onSubmit` into the export sheet with a
  host migration burden; and changes Alt+click to fire on release. Plus a schema bump, new export
  contract lines, and an upward budget ratchet.
- **Survivors 5 and 6 returned to scope.** 5 (single-owner disarm) because R11 extends the gesture that
  has leaked seventeen times; 6 (`data-pinflow-source`) because it is the top rung of the scope ladder,
  not a separate feature.
- **Terminology:** the schema field and export label are **scope**. "Blast radius" is prose only —
  `types.ts` already uses that phrase for the computed-style snapshot, which is a _property_ radius, and
  that comment needs correcting to avoid a collision.

## Dependencies / Assumptions

- Builds on `claude/peaceful-mclaren-c0d78e` (hover outline, marquee picker, one-dock chrome, Alt
  grammar, `suspended()` ownership protocol). That branch is unmerged and already ratcheted core to
  15.90 KB; all estimates here are relative to it, not to `main`.
- The branch's `suspended()` / `Press.dead` protocol is assumed to be the correct foundation for R15
  rather than something to replace.
- Assumes the visible outline can reuse the branch's hover-outline scaffold; a union-box variant for
  multi-element scopes may be needed.
- Every new export field inherits the never-weaken escaping contract and requires hostile-input tests.

## Outstanding Questions

### Resolve Before Planning

_(none — all product decisions resolved)_

### Deferred to Planning

- [Affects R1, R5–R8][Technical] Schema shape: does `Comment`/`Anchor` gain a `kind` discriminator
  (point / region / insertion), or is presence of the covered set sufficient? Confirm the v3→v4
  migration path.
- [Affects R5, R6][Needs research] Empirical thresholds: the coverage band boundaries, the collapsed-set
  cap, and the R4 size sanity limits all need tuning against real pages rather than being guessed.
- [Affects R2][Needs research] The repeated-sibling predicate: how much class-token overlap constitutes
  a match, and how it behaves under CSS-modules/Tailwind hashing.
- [Affects R5, R10][Needs research] Whether coverage scoring plus outline rendering stays inside the
  ≤4 ms/frame budget on a large DOM, and whether the existing anchor cache generalises.
- [Affects R5][Technical] Whether the numbers-only `**Area:**` line survives for covered-set annotations
  or is retained only for insertions.
- [Affects R11][Technical] Which element receives `touch-action` suppression for the live gesture, and
  how restoration is guaranteed through `pointercancel` and the pinch-abort path.
- [Affects R16][Technical] Whether the `data-pinflow-source` whitelist is extension-allowlist or
  pattern-based, and its interaction with monorepo-relative paths.
- [Affects all] Sequencing: whether the branch merges to `main` first or the sprint builds on it
  directly — hosts should absorb one breaking change, not two.
- [Affects R1–R9][Technical] Placement of the scope engine as pure functions outside `annotator.ts`,
  which is already an accepted deviation at 1,721 lines on the branch.

## Next Steps

→ `/ce:plan` for structured implementation planning.
