# Pinflow artifact quality & bundle budget — spec and review

**Status:** for review · **Date:** 2026-08-16 · **Branch:** `claude/pinflow-hotspots-quality-44ba76` · **PR:** [#12](https://github.com/brijeshp/pinflow/pull/12) (draft, CI green)

Companion to `docs/plans/2026-08-15-001-fix-hotspot-quality-and-size-ratchet-plan.md`. That document is the plan; this one is what the work found, what shipped, what was rejected, the standing budget policy, and the open questions.

---

## 1. The question

Not "is the scope model correct" but:

> Pinflow hands a coding agent a markdown file. **Can the agent make the right edit without going back to the reviewer?**

A field that is technically accurate but unusable, misleading, or that forbids the correct fix is a **defect**, regardless of whether the code computing it is right.

The bar already existed, from the blast-radius origin document: _"the artifact lets Claude Code/Codex locate and propose a fix for ≥80% of notes without human disambiguation."_

## 2. Method

Audited a **real export** — `pinflow-feedback-Brij-pinflow-dev-2026-08-15T20-50-23-940Z.md`, five comments a human left on the pinflow marketing page, route `/`, 1800×933 — rather than reviewing code in the abstract.

Two multi-agent passes: one over the scope/anchor/export pipeline against the artifact (60 candidate findings, 56 survived three adversarial refuters), one over the bundle (61 candidate cuts, 7 survived, all measured by rebuild rather than estimated). A completeness critic then re-ran the five notes against the proposed fix list and **killed one fix, rewrote another, and reprioritised the rest**.

**Why this mattered:** the naive reading of the top finding — "apply `tooWide` to marquees" — would have demoted the artifact's _best_ note and flattened all five to `confidence: low`, manufacturing a round-trip per note. Only running the fix back through the real data caught it.

## 3. What the audit found

### 3.1 Verdict per note

| #   | Note                                            | Before                  | After                                    |
| --- | ----------------------------------------------- | ----------------------- | ---------------------------------------- |
| 1   | "Change to 'Put feedback around the page'"      | actionable              | actionable                               |
| 2   | "Left align"                                    | actionable (best block) | actionable + alignment now disambiguated |
| 3   | "These bullets need work"                       | **broken**              | actionable                               |
| 4   | "Remove shifting animation"                     | actionable              | actionable                               |
| 5   | "Remove shifting animation across all of these" | actionable              | actionable                               |

### 3.2 The three defects that changed an edit

**D1 — `Area covers` could describe a different part of the page than the region.** The climb recorded its _last_ element before stopping (the highest child below the containing ancestor). Containment is zero-tolerance, so a rect drawn slightly wider than its block walked past that block and quoted a sibling's opening text — while `**Position:**` still pointed at the right place. Nothing in the artifact could reveal the disagreement, so an agent reading prose before percentages edits the wrong element without disobeying anything.

**D2 — `confidence` was anti-correlated with usefulness.** `resolveScope`'s region branch assigned a rung and published `CONFIDENCE[rung]` without R4's size check. Notes 1 and 5 published `#main` — the whole page — at `medium`, while note 4's tightly-scoped `<pre>` published at `low`. R4 says _every_ rung is size-checked, so this was a requirement violation, not a design choice.

**D2a — but `tooWide` is mis-tuned, and the obvious fix is worse than the bug.** `MAX_VIEWPORT_SHARE` compares an element's **full scroll box** against **one viewport**, so on a content page it is a "taller than the screen" test, not a page-ness test:

| element                            | descendant share | viewport share | `tooWide` |
| ---------------------------------- | ---------------- | -------------- | --------- |
| `#main`                            | 0.87             | 8.01           | true      |
| `section.well` (note 2's boundary) | 0.187            | **1.97**       | **true**  |
| `figure.artifact-figure`           | 0.159            | 0.72           | false     |

**D3 — a region that slices a repeated set said nothing about the slice.** `visit()` partitions purely on rect coverage: ≥0.90 inside, ≥0.35 partial, >0 excluded, =0 recorded nowhere. `ul.callouts` is a 3-column grid; the region covered column 1 fully, clipped column 2 by ~1%, and missed column 3. Result: `li` 1+4 changeable, `li` 2+5 **forbidden**, `li` 3 named nowhere — rendered as `**Change — 2 element(s)**` over a five-item list. The geometry was correct. The artifact was precision theatre.

**D4 — `Do not change` made the weakest evidence absolute.** _"Never edit anything under **Do not change** to satisfy a note"_ was the artifact's most authoritative sentence, applied to a bare coverage ratio against a hand-drawn rectangle — while the boundary beside it, from a real containment test, already carried an explicit override clause. Combined with D3, a ~1% overhang past a grid gutter **forbade the only coherent fix**.

### 3.3 Corrections to the initial read

Recorded because acting on any would have wasted effort:

- Notes 4 and 5 are **not** one CSS rule — two independent rules in two separately-scoped components. Separate fixes are correct.
- The scope did **not** exclude note 4's fix site; `.artifact-tilt` carries only padding, and the animating `.artifact-card` was already named in the printed css path.
- **Coalescing members to their covering parent is the bug 0.8.0 exists to fix.** R6's collapse rule was replaced mid-planning for exactly this reason.
- Dropping the grazed siblings from `excluded` **softens D3 by deleting evidence** — the split survives and becomes harder to notice.

## 4. What shipped

Measured gz, IIFE / ESM, each landed TDD-first.

| #   | Change                                                                         | IIFE     | ESM      |
| --- | ------------------------------------------------------------------------------ | -------- | -------- |
| 1   | `treeshake: true` on the IIFE entry (sole omission; dead CJS-interop preamble) | −191     | 0        |
| 2   | Golf bundle: `box()`, `climb()` single-`rungOf`, `pct()`, tag regex tables     | −87      | −91      |
| 3+4 | R4 on marquees (**descendant share only**) + `text-align` when non-default     | +36      | +42      |
| 5   | `Area covers` names the block the sample hit                                   | +119→+69 | +124→+76 |
| 6   | `Scope.siblings` → `Change — 2 of 5 <li>`                                      | +155     | +157     |
| 7   | `Do not change` unbound, note-scoped, deterministic default                    | +30      | +32      |
| 8   | Source hint resolved from an ancestor                                          | +31      | +26      |
| 9   | Label ellipsis + exclusion cap announces itself                                | +4       | +5       |

`SCOPE_GEN` → 3 (0.9.2 raised it from 2 for the R9 band change), bumped once for all semantic changes. Older records still hydrate and render as `— older tuning`.

Also: all 9 `pinflow-site` components carry `data-pinflow-source` (separate repo, branch `feat/pinflow-source-instrumentation`, **not pushed** — it likely auto-deploys).

### 4.1 The one fix cut on budget

Clamping an area sample to its nearest block cost **76 B ESM**, and the budget had room for that **or** the N-of-M note, not both. N-of-M prevents a wrong edit; the clamp prevents a confusing quote (a sample landing on an `<em>` can print `“make this button clearer”` — a page string that reads like reviewer prose inside a feedback file). N-of-M won. The current behaviour is pinned by a **characterization test** so re-adding the clamp fails loudly.

> **Feedback wanted:** is that the right call, or is the inline-fragment quote worse than I judged?

## 5. Deliberately rejected

| Rejected                                                                  | Why                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Motion capture** (`animation`/`transition`/`transform` + ancestor walk) | 3 of 5 real notes are motion/layout and their `Computed:` line is dead weight — the largest observed note class is unserved. But element-only capture reports nothing for note 4 (the animation is on the parent), the ancestor variant breaks `anchor.ts`'s stated contract that every field describes the same element, and it needs its own line plus storage validation. Several hundred bytes. **Owner chose `textAlign` only.** |
| **Widening members to the covering parent**                               | Re-creates the 0.8.0 bug. Parent is recoverable as the shared css prefix.                                                                                                                                                                                                                                                                                                                                                             |
| **Tolerant `containerFor`**                                               | A tolerant container can return an ancestor not containing the region, and `visit()` clips against `boxOf(boundary)` — parts of the region would vanish from every ratio, shrinking members and inflating exclusions.                                                                                                                                                                                                                 |
| **`**Related:**` cross-comment line**                                     | Notes 4/5 are genuinely independent. Costs an O(n²) pass, must route a comment id through `inline()`, and `getCssPath`'s six-segment cap yields unrooted paths that silently fail prefix matching.                                                                                                                                                                                                                                    |
| **Lengthening `COVER_MAX` 40→80**                                         | Amplifies D1 rather than fixing it. Revisit now that D1 is fixed.                                                                                                                                                                                                                                                                                                                                                                     |
| **Screenshots**                                                           | Rejected twice already; unchanged.                                                                                                                                                                                                                                                                                                                                                                                                    |

## 6. Tightening the codebase inside X kB

This is the standing policy section — the part that outlives this branch.

### 6.1 Where the budget stands

|           | ceiling before | CI actual | ceiling now                  |
| --------- | -------------- | --------- | ---------------------------- |
| core IIFE | 22.82 kB       | 22.75 kB  | **22.8 kB** (down)           |
| core ESM  | 22.42 kB       | 22.55 kB  | **22.6 kB** (approved raise) |

**Pre-blast-radius baseline, rebuilt on the same machine at `5c2e414`: 18.71 kB IIFE / 18.38 kB ESM.** The 0.8.0 scope model cost +3.96 kB. **"Get back to 18 kB" means "delete the hotspots feature."**

### 6.2 Three rules this work established

1. **The two core entries move independently.** The same golf freed **278 B on IIFE and 91 B on ESM** — treeshaking recovered a preamble only the IIFE build emitted. Never reason about "the core budget" as one number; never assume a saving on one entry transfers.
2. **Per-item byte estimates are unreliable in both directions.** One fix estimated at ~50 B measured **155 B**; two estimated at ~60 B together measured **5 B** (both reused patterns already in the bundle). Land related cuts as one commit and quote the bundle figure.
3. **The local→CI gap scales and is not symmetric.** Measured here: **103 B IIFE** (matching the documented ~100 B) and **70 B ESM** (the invariant documents ~50 B, which is optimistic). Always push-read-ratchet; never predict.

### 6.3 Where the bytes actually are

Marginal gz, IIFE, from sourcemap attribution:

| file                    | gz    | share |
| ----------------------- | ----- | ----- |
| `ui/annotator.ts`       | 7,386 | 32.6% |
| `export.ts`             | 2,711 | 12.0% |
| `ui/styles.ts`          | 1,754 | 7.7%  |
| `storage.ts`            | 1,639 | 7.2%  |
| `scope.ts`              | 1,591 | 7.0%  |
| `selector.ts`           | 1,301 | 5.7%  |
| `gesture/controller.ts` | 862   | 3.8%  |
| `anchor.ts`             | 590   | 2.6%  |

`annotator.ts` is **flat** — no hotspot; the largest single member is 411 B. There is no single cut in it worth >0.4 kB. `types.ts` contributes **0 B** (pure types, correctly erased).

### 6.4 Behaviour-preserving golf is exhausted

The entire inventory measured **278 B IIFE / 91 B ESM** and has been taken. Everything remaining costs a capability. Priced menu, gate figures, ordered by cost-per-quality-lost:

| Trade                      | IIFE   | ESM   | What is lost                                                                                                                              |
| -------------------------- | ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ScopeOutline`             | −404   | −398  | The on-page paint confirming what region Pinflow understood. Record/artifact/API byte-identical.                                          |
| Builder-mode UI            | −1094  | −1106 | Builder drawer, reviewer filter, aggregate pin view. `exportBuilder` stays public.                                                        |
| Post-export confirmation   | −235   | −227  | The only recovery channel for an unverifiable `download()`. **Spec 5.6 requires it**; both measuring passes advised against.              |
| `contrastFor()`            | −203   | −219  | One-variable theming. Documented API narrowing.                                                                                           |
| Scope rung (c)             | −194   | −195  | Repeated-sibling detection. Measured firing on 6/13 and 15/57 leaf pins with **zero false positives**.                                    |
| Insertion points           | −367   | −377  | `**Insertion point:**`, taught in all four agent formats. A scope.ts-only variant is −153 and needs no pack edit.                         |
| Whole marquee/area feature | ~−1600 | —     | Area comments entirely. A revert of 0.5.0/0.6.1.                                                                                          |
| Whole `anchor.context`     | −664   | —     | `Context:`/`Computed:`/`Image:` — and it removes `validContext` from the hydration boundary, so it is a validator weakening, not a trade. |

**Not offered at any price:** `export.ts`'s `PREAMBLE` (366 B — the anti-injection trust boundary), `storage.ts`'s validator family (638 B), the `source-path.ts` allowlist, the never-`<body>` guarantees, console diagnostics.

### 6.5 What a target actually costs

- **~21 kB** — outline + builder UI. Export contract byte-identical, spec-required panel intact.
- **20 kB** — everything through insertion points, landing at 19,893 against a ~19,850 requirement: **43 B of margin, inside measured inter-cut noise**, so a further top-up is load-bearing, not padding.
- **18 kB** — give back 0.8.0 and most of 0.5.0/0.6.1.

> **Feedback wanted:** is ~21 kB (outline + builder UI) worth taking as a follow-up, or is the on-page outline load-bearing for reviewer trust in a way the byte figure doesn't capture?

## 7. Review findings

Self-review of `main..HEAD`. No CRITICAL or HIGH. Nothing blocking.

**F1 — LOW, confirmed by execution. `siblings` is not validated against member tag uniformity at the hydration boundary.** `scope.ts` sets `siblings` only when every member shares one parent _and_ tag. `storage.ts` re-admits it on count alone, and `export.ts` labels the sentence with `members[0].tag`. A `source()` payload with mixed-tag members renders:

```
**Change — 2 of 9 `<li>` this note may alter:**    ← one member is a <section>
```

Capture can never produce this; a backend, imported export or tampered blob can. Escaped, so no injection — but it asserts a set that does not exist, and the repo's own rule (`scope-limits.ts`) is that hydration re-checks what capture guarantees. **Fix:** admit `siblings` only when all member tags equal `members[0].tag`. ~15 B.

**F2 — LOW. `climb()` runs twice per point pin.** The point-pin branch calls `climb(above)`; the source hint then calls `climb(boundary)`. Not equivalent (the second can see a `data-pinflow-source` on the target itself, which is why it is written that way), so this is duplicated work rather than a bug. Bounded by `DEPTH_CAP` 12 and runs once per placement, never per frame — measured impact negligible. Recorded so it is a decision, not an oversight.

**F3 — LOW, pre-existing and worsened. `resolveScope` is 104 lines** (was ~80; the guideline is 50). `scopeLines` is 56, `validScope` 64. `annotator.ts` is 2,267 lines against a 800 guideline — a deviation the 0.5.0 plan already accepted at 1,721.

**F4 — INFO. `source` no longer implies `rung: 'source'`.** Decoupling is intentional (a hint need not be the boundary). Verified the four agent formats describe the hint independently of the rung, so no parity break.

**F5 — INFO. `box()` now writes `display: ''` where `ScopeOutline._place` previously did not.** A no-op on the freshly-created `el('i')` both call sites pass, but it is an implicit coupling: a future caller passing a hidden reused node would get different behaviour.

**Clean:** no secrets, no `console.*`, no TODO/FIXME, no mutation of inputs, escaping unchanged (AST guard green), `_`-prefix rules respected (`box`/`pct` correctly unprefixed; `scope.ts` zero-underscore test green). Coverage 97.25% stmts / **92.07% branch** (up from 91.96%). 818 tests, e2e 51.

## 8. Decisions (resolved 2026-08-16)

| #   | Question                                    | Decision                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | F1 — `siblings` tag uniformity at hydration | **Fixed on this branch.** Mirrors capture's parent+tag rule.                                                                                                                                                                                                                                          |
| 2   | The inline clamp trade (§4.1)               | **Stands.** 76 B against 50 B of headroom; the wrong-edit generator was D1 and D1 is fixed. Characterization test keeps it visible.                                                                                                                                                                   |
| 3   | Motion capture                              | **Deferred, and the evidence downgraded.** "3 of 5 notes" is one page with two tilt animations — not a rate. Gather more real exports before spending several hundred bytes; if taken, it needs its own design (nearest animated ancestor, own export line, own validation), not a field on `styles`. |
| 4   | ~21 kB follow-up                            | **Open** — see §6.6.                                                                                                                                                                                                                                                                                  |
| 5   | `COVER_MAX` 40→80                           | **Taken.** The amplification objection died with D1. Capture stops double-slicing; the render chokepoint still caps, at `FP_MAX`.                                                                                                                                                                     |
| 6   | `MAX_VIEWPORT_SHARE` retune                 | **Taken, inside the gen-2 window.** Now share-of-document-area. Restores note 4's `**Change:**` block.                                                                                                                                                                                                |

### 8.1 On question 6

The old constant divided an element's **full scroll box** by **one viewport**, which asks "is this taller than the display" — true of nearly every section on a content page. R4 asks whether a candidate is really _the page_, and the page is the document. Same predicate, right denominator (`documentElement.scrollHeight`, falling back to viewport height, which reads 0 before layout).

The pinned test `'a landmark covering the whole viewport is demoted by area alone'` was **re-derived from intent rather than edited to pass** — it now asserts a landmark covering the whole _document_ is demoted, and a second test pins the regression it caused: a section two viewports tall but a small share of its document keeps its rung and seeds the pinned element as the change.

## 9. Builder mode: removed, and what a paid tier should keep

Decided 2026-08-16 and landed in this release rather than deferred, so one changeset and one
version PR cover it.

**What it was.** `mode: 'builder'` drew a drawer listing every reviewer with a checkbox that
filtered pins live, rendered other reviewers' comments as read-only pins with attribution and
disposition, and offered Export all / JSON / Clear all.

**Why it went.** `_allStores()` reads `localStorage`, so it aggregated one **browser**, never a
team — the guide already said "not an administrative or authenticated area". A real
multi-reviewer tier is backend-shaped and would not reuse that data layer, so the UI could only
ever be rewritten, not extended. Nothing used it. Confirmed by searching the downstream hosts;
the one thing a code search cannot rule out is a human opening `?mode=builder` by hand.

**What survived, deliberately.** The DOM-free aggregation toolkit is the paid-tier substrate and
is untouched: `exportBuilder()`, `exportJSON`'s builder arm, `exportFilename(project, null, …)` →
`{project}-aggregate`, `_allStores()`, and `mode: 'builder'` itself. No `.d.ts` break; the mode
still resolves and still aggregates.

**What a paid tier should take from it** — the decisions, not the DOM:

- Reviewer filtering is a _display_ concern, not an export concern. The old drawer filtered pins
  but exported everything; that asymmetry was right and worth keeping.
- A foreign comment must open read-only with attribution and disposition. The removed
  `_openBuilderView` is the reference for what that surface needs to show.
- The aggregate filename is `{project}-aggregate`, distinct from `{reviewer}-{project}` — a
  roll-up must never be mistaken for one person's export.
- Two unnamed reviewers must stay distinguishable in an aggregate, which is why `exportJSON`
  keeps raw handles there and applies `attribution()` only to single-reviewer exports.

**Retrieval:** `git show builder-mode-final:src/core/ui/annotator.ts`.

**Measured:** −582 B gz IIFE / −593 B ESM. Less than the audit's −1094 estimate because that
figure assumed the annotator stops calling `exportBuilder` entirely, letting DCE drop it; keeping
aggregation — which the audit itself required — costs roughly 500 B of the difference.

## 10. Open question: the remaining ~21 kB levers

See §6.4. With builder UI taken, the next candidates are the scope outline (−404 B, argued
against in §6.5) and the post-export confirmation panel (−235 B, which spec 5.6 requires).
