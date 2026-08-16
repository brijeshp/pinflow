---
title: 'fix: hotspot quality defects and a behaviour-preserving size ratchet'
type: fix
status: active
date: 2026-08-15
origin: docs/brainstorms/2026-08-06-blast-radius-0.5.0-requirements.md
---

# fix: hotspot quality defects and a behaviour-preserving size ratchet

## Overview

The blast-radius scope model shipped in 0.8.0. This plan is the first evidence-driven correction to it,
derived from auditing a **real** export — five comments a human reviewer left on the pinflow marketing
page (`pinflow-feedback-Brij-pinflow-dev-2026-08-15T20-50-23-940Z.md`, route `/`, 1800×933 desktop) —
against the question the feature exists to answer: _can a coding agent act on this file without a
round-trip to the reviewer?_

Four of the five notes are actionable. One is broken in a way neither party can detect. Separately, the
`confidence` field is currently **anti-correlated with usefulness**, and the bundle has grown 3.96 kB
since the sprint began.

Two tracks, one branch. The size track is sequenced **first** because it frees the budget the quality
track spends: golf yields −278 B measured, the quality fixes cost roughly +200 B estimated, so the
ceilings still ratchet **down** and **no ceiling raise is required at any point**. That was the single
largest open question going in, and it is now closed by measurement rather than by owner sign-off.

## Problem statement

### What the artefact did, note by note

| #   | Reviewer note                                   | Outcome                                | Cause                                                                                                                                                                           |
| --- | ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Change to 'Put feedback around the page'"      | Actionable                             | `Change` entry 1 is `#hero-title > span.accent`, whose text is literally "directly on the page"                                                                                 |
| 2   | "Left align"                                    | Actionable — the artefact's best block | Boundary `section.well:nth-of-type(2)` + one member `header.section-head.narrow` is what stops a fix to the global rules touching six other section heads                       |
| 3   | "These bullets need work"                       | **Broken**                             | `Area covers` names the code card while the region was drawn over the callouts; `Change` permits 2 of 5 parallel `<li>`, `Do not change` binds 2 more, the 5th is named nowhere |
| 4   | "Remove shifting animation"                     | Actionable                             | The printed css path already contains `div.code-card.artifact-card`, which is where `rotate: -1.8deg` lives                                                                     |
| 5   | "Remove shifting animation across all of these" | Actionable                             | `Change` names `ul.scenes` and `details.more`; `details.more` wraps the second scene list, so nothing is left animating                                                         |

The measured bar from the origin document is _"the artifact lets Claude Code/Codex locate and propose a
fix for ≥80% of notes without human disambiguation"_ (see origin:
`docs/brainstorms/2026-08-06-blast-radius-0.5.0-requirements.md`). At 4/5 the export clears it — but it
clears it **despite** the scope machinery, not because of it, and note 3 fails in the one way the format
is supposed to prevent.

### The three defects that change an edit

**D1 — `Area covers` and the Context heading can name a different part of the page than the region.**
`_placeAreaComment`'s climb records `sub`, the last element before an ancestor that _fully contains_ the
drawn rect (`src/core/ui/annotator.ts`, the `climb` closure). Containment is zero-tolerance, so a rect
drawn slightly wide of an inner block climbs past it and `sub` becomes a large ancestor whose leading
text describes something else entirely. On note 3 the three human-readable locating fields point at the
code card while `Position: 22% from left, 91% from top` — the numeric field nobody reads first —
correctly places the note over the callouts. An agent reading prose before percentages has every reason
to edit the wrong element, without disobeying anything in the file.

**D2 — `confidence` is anti-correlated with usefulness, because R4 is not applied to marquees.**
`resolveScope`'s region branch sets `boundary = containerFor(...)`, `rung = rungOf(boundary)`,
`confidence = CONFIDENCE[rung]` and never calls `tooWide()`. The point-pin branch does. Result: notes 1
and 5 publish `#main` — the whole page — at `medium`, while note 4's tightly-scoped `<pre>` publishes at
`low`. R4 in the origin document says _"**Every** rung is subject to a size sanity check"_ (emphasis
original scope), so this is a requirement violation, not a design choice.

**D2a — but `tooWide` itself is mis-tuned, and the naive fix makes things worse.** `MAX_VIEWPORT_SHARE
= 0.9` compares `area(boxOf(el))` — the element's **full scroll box** — against **one viewport**. On any
content page that is a "taller than the screen" test, not a page-ness test. Measured at 1800×933:

| element                                           | descendant share | viewport share | `tooWide` |
| ------------------------------------------------- | ---------------- | -------------- | --------- |
| `#main`                                           | 0.87             | 8.01           | true      |
| `section.well:nth-of-type(2)` (note 2's boundary) | 0.187            | **1.97**       | **true**  |
| `div.wrap` (note 3's boundary)                    | 0.184            | 1.19           | true      |
| `figure.artifact-figure`                          | 0.159            | 0.72           | false     |

Applying `tooWide` verbatim to the region branch would demote **note 2 — the artefact's best note — to
`low`**, making all five notes read `low`. The pack tells agents to verify anything at `confidence: low`
(`agent/skills/pinflow-feedback/SKILL.md`), so that change would manufacture five round-trips. The
correct fix is smaller: **use only the descendant-share predicate in the region branch.**

**D3 — a region that slices a repeated set says nothing about the slice.** `visit()` partitions purely
on rect coverage: `≥0.90` inside, `≥0.35` partial, `>0` excluded, `=0` recorded nowhere. `ul.callouts`
is a 3-column grid at x = 452 / 759 / 1065, each 283 px wide; the reconstructed region spans x 405–762.
Column 1 is fully covered (`li` 1, 4 → members), column 2 is clipped by ~3 px of 283 ≈ 1% (`li` 2, 5 →
excluded), column 3 is untouched (`li` 3 → absent). The geometry is behaving exactly as designed. The
artefact then renders `**Change — 2 element(s) this note may alter**` over a five-item list and says
nothing about the other three: precision theatre over a vague note.

### Corrections to the initial read

Recorded because acting on any of them would have wasted a sprint.

- **Notes 4 and 5 are not one CSS rule.** `Artifact.astro` `.artifact-card` and `UseCases.astro`
  `.scene` are two independent rules in two separately-scoped components. Fixing them separately is
  correct and complete. A `**Related:**` cross-reference line is _not_ worth its bytes.
- **The scope does not exclude note 4's fix site.** `div.artifact-tilt` carries only
  `padding-block: 1.25rem`; the rotation is on its child `.artifact-card`, which appears in no
  `Do not change` list anywhere in the file.
- **Coalescing members to their covering parent is the bug 0.8.0 exists to fix.** R6's collapse rule was
  replaced mid-planning precisely because it re-creates "a marquee over three pricing cards records the
  grid". The note-3 fix must keep the partition and add honesty about it.
- **Dropping the grazed siblings from `excluded` softens note 3 by deleting evidence.** The split
  survives and becomes _harder_ to notice, because the file stops mentioning `li` 2 and 5 at all.

## Proposed solution

Land in four phases on one branch. Phases 0–1 are the release; phases 2–3 are hygiene and mechanics.

- **Phase 0 — golf.** −278 B IIFE / −91 B ESM, measured. Funds everything after it.
- **Phase 1 — the three fixes that change an edit.** D1, D2, D3, plus `textAlign`.
- **Phase 2 — honesty hygiene.** Truncation marker, exclusion-cap demotion, source-ancestor hint.
- **Phase 3 — ratchet and release.** Push, read CI, re-ratchet razor-thin, wiki, changeset.

### Why golf goes first

Current local gate: **IIFE 22,668 B against a 22,820 B ceiling** (152 B headroom); ESM 22,311 against
22,420 (109 B). Phase 1 + 2 are estimated at ~200 B. Landing them first would leave under 0 B of margin
against a CI figure that runs ~100 B heavier on IIFE at this size. Landing golf first leaves ~430 B.

## Technical approach

### Phase 0 — behaviour-preserving golf (−278 B IIFE, −91 B ESM)

**0.1 · `treeshake: true` on the IIFE entry.** −191 B IIFE, reproduced by two independent rebuilds. ESM
unchanged (already treeshakes). One line in `tsup.config.ts`, inserted into the second `defineConfig`
entry (`entry: { pinflow: 'src/core/iife.ts' }`) immediately after `format: ['iife'],`. The ESM/CJS core
config and the wrapper config already set it; the IIFE entry is the sole omission, so esbuild's unused
`__require`/`__toESM` CJS-interop preamble — emitted unconditionally because `@brijeshp/pinflow/voice`
is an external dynamic import in iife format — ships today and rollup's post-pass drops it.

> **Use `true`, never `'smallest'`.** That preset sets `propertyReadSideEffects: false`, which would
> license rollup to delete the layout-forcing `.offsetHeight` / `.offsetWidth` reads in `annotator.ts`.

> **This change is invisible in raw bytes.** Shipped-artifact `gzip -9` falls 296 B while raw minified
> falls 32 B. Do not judge it on raw output.

**0.2 · The four-cut golf bundle — one commit.** −87 B IIFE / −91 B ESM _as a bundle_. Per-cut figures
moved −14 to +6 B when stacked while the bundle total moved 5 B, so **quote the bundle, never the line
items**.

| cut | file                                                    | change                                                                                                                                                                |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | `src/core/ui/dom.ts` + `annotator.ts` + `ui/outline.ts` | `export function box(node, l, t, w, h)` writing `display=''`/left/top/width/height in px; `_sizeHoverEl`, the `_placeArea` tail and `ScopeOutline._place` all call it |
| b   | `src/core/scope.ts`                                     | `climb()` replaces four per-level rung predicates with `const rung = rungOf(cur); if (rung !== 'anchor' && !hits.has(rung)) hits.set(rung, cur);`                     |
| c   | `src/core/storage.ts`                                   | module-local `function pct(v: unknown) { return finite(v) && v >= 0 && v <= 100; }` used by `hasValidAnchor`'s x/y chain and `validArea`'s per-key body               |
| d   | `src/core/scope.ts`                                     | `SKIP_TAGS` / `LANDMARK_TAGS` / `LANDMARK_ROLES` become anchored alternation regexes in the shape `selector.ts` already uses                                          |

Non-negotiables inside 0.2:

- **`box` stays unprefixed.** It is a module-level export crossing a boundary; a `_` would violate the
  `mangleProps` contract. Rename the shadowing locals instead (`annotator`'s `const box` → `bx`,
  `outline`'s param `box` → `b`).
- **Cut (d) regexes must anchor both ends** `/^(a|b)$/`, carry **no `/g`** (`lastIndex` is stateful
  across `.test`) and **no `/i` on the two TAG regexes** — adding `/i` would silently start matching
  SVG's lowercase `defs`, a behaviour change smuggled into a byte commit.
- One knowing non-behavioural regression in (b): `rungOf()` now runs `isRepeated()` at every level even
  after a `repeated` hit, where the original short-circuited. Negligible at `DEPTH_CAP` 12, but it is a
  slowdown, not a speedup. Record it in the commit body.

### Phase 1 — the fixes that change an edit

**1.1 · `Area covers` names the deepest sampled _block_ (D1).** In `_placeAreaComment`, stop tracking
`sub` and record the sample's own hit, clamped to the nearest block-level ancestor:

```ts
const climb = (x: number, y: number): Element | null => {
  let e: Element | null = document.elementFromPoint?.(x, y) ?? null;
  if (e && this._ui.host.contains(e)) e = null; // a pin under the sample
  const hit = e;
  while (e && !contains(e)) e = e.parentElement;
  if (hit && hit !== e && subjects.length < 3 && !subjects.includes(hit))
    subjects.push(blockish(hit));
  return e;
};
```

The `hit !== e` guard reproduces today's null-`sub` case, so a rect drawn inside one leaf still names
nothing rather than naming its own container. Everything downstream is unchanged: `covers` is still
`subjects.map(getTextFingerprint)` joined, `subjects[0]` is still the `deep` heading source, and the
anchored element is still `anchorTarget(target)`.

> **The block clamp is load-bearing, not tidiness.** Without it, note 2's centre sample is an `<em>` and
> the artefact prints `**Area covers:** "\"make this button clearer\""` — a page string that reads like
> reviewer feedback inside a feedback file. The field's own name also stops being true: "covers"
> promises a block, not whatever leaf is under the pointer.

Probed on note 3, the three samples move from `figure.artifact-figure` ×3 to `ul.callouts` /
`figure.artifact-figure` / `li`. On note 1 `Area covers` gains "directly on the page".

**1.2 · Descendant-share-only R4 in the region branch (D2 + D2a).** ~16 B. In `resolveScope`'s region
arm, demote when the boundary's share of the document's elements exceeds `MAX_DESCENDANT_SHARE` —
**do not** reuse `tooWide()`, whose viewport predicate was never tuned for this branch.

Outcomes: `#main` at 0.87 demotes to low (correct); `section.well` at 0.187 keeps `medium` (correct);
`div.wrap` stays `low` on its `anchor` rung anyway.

> **This also improves note 4 for free, and deletes a fix from the list.** `isRepeated(section.well)` is
> true, so `climb()` from the `<pre>`'s parent returns the _section_ at rung `repeated`, and R4 fires
> today **solely** because `tooWide(section)` is true via viewport share 1.97. Under the descendant-only
> rule R4 does not fire: note 4's boundary becomes `section.well:nth-of-type(2)` at
> `rung: repeated, confidence: medium`, and because `boundary !== target` the existing
> `w.members.push(target)` already seeds the `<pre>` as the change. No new code, no `narrowed` flag.
> A separately-proposed "seed the pinned member when R4 collapses" fix is therefore **cut** — it was
> 25 B and a `SCOPE_GEN` bump to emit a verbatim third copy of the `**Element:**` line.

**1.3 · The N-of-M sibling signal (D3).** ~50 B. When every member shares a parent and that parent has
unlisted same-tag children, append a note to the `**Scope:**` line: `2 of 5 <li> in the same list`.

This is the only change in the whole exercise that makes note 3 self-correcting. It adds one line of
_information_ rather than deleting evidence, it does not widen the scope, and it does not re-create the
R6 collapse bug. The `Do not change` entries for `li` 2 and 5 stay exactly where they are.

**1.4 · Un-bind `Do not change`.** ~0 B net. The artefact's most authoritative sentence — _"Never edit
anything under **Do not change** to satisfy a note"_ in `export.ts`'s `PREAMBLE`, repeated verbatim in
all four shipped pack files — makes a bare 0.35 area ratio against a hand-drawn rectangle binding, while
the boundary, derived from a real containment test, gets an explicit override clause one sentence
earlier. Replace with a note-scoped, **deterministic** default:

> `**Do not change** lists what the drawn region only grazed — geometry, not intent, and only for the
note it sits under. Prefer leaving them; if a coherent fix needs one, change it and say so.`

Keep it byte-neutral by compressing the two Source-hint lines into one in the same edit.

> **"Confirm before editing one" is the wrong wording.** It has no addressee in a no-round-trip
> pipeline — the agent either asks (round-trip) or self-authorises. The clause above mirrors the
> boundary clause's grammar and introduces no new decision procedure.

**1.5 · `textAlign` in the computed snapshot.** ~15 B, emitted only when non-default. Note 2's "Left
align" is genuinely ambiguous between text alignment and un-centring a `margin-inline: auto` block, and
the page centres via **two** separate global rules (`.section-head { text-align: center }` and
`.narrow { … text-align: center }`). The stylesheet tells an agent where the rules are; it does not tell
it which one the reviewer meant.

> Keep the value a **string** inside `context.styles`. `storage.ts`'s `validContext` validates styles as
> all-strings but ignores unknown context keys, and `normalizeComments` **spreads** the anchor rather
> than rebuilding it — so a new sibling object would arrive from a `source()` payload completely
> unvalidated.

### Phase 2 — honesty hygiene

**2.1 · Truncation marker on scope-node labels.** ~20 B. `LABEL_MAX` is 80 and labels are cut silently,
so an agent rewrites from text it has no reason to distrust. Use the same `…` the `Element` line already
applies at `FP_MAX`.

**2.2 · `EXCLUDED_CAP` sets `truncated` and demotes confidence**, at capture and at hydration. ~40 B
across `scope.ts` / `storage.ts` / `types.ts`. Changes no edit in this file (the largest exclusion list
here is 3 of 12) — it is the failure mode one busy marquee away, and it closes the "these counts are a
complete accounting" misreading from the other end.

**2.3 · Resolve the source hint from an ancestor, not only from the boundary.** The region branch reads
`rungOf(boundary)` and `sourceOf(boundary)` only — there is no climb for a source ancestor. Notes 1 and
5 have boundary `#main`, note 3 `div.wrap`, note 4 `<pre>`; none is a component root. Without this,
instrumenting the host page with `data-pinflow-source` delivers a hint to **note 2 alone**. A hint is
not a boundary, so it does not need to be the boundary element.

**2.4 · Instrument the reviewed site.** Separate repo: `/Users/brijeshpatel/Apps/pinflow-site`
(`github.com/brijeshp/pinflow-site`), zero bundle bytes. Add `data-pinflow-source` to `Hero.astro`,
`Artifact.astro` and `UseCases.astro`, and document the practice in `README.md` and the pack. Sequence
**after 2.3** or the payoff does not materialise.

### Phase 3 — ratchet and release

1. Push phases 0–2 and **read the figure CI reports**. Never set a ceiling from a local build.
2. Re-ratchet `package.json` to that figure **+ ~50 B** in a follow-up commit.
3. Move `docs/wiki/.last-sync` as its **own final commit** — the marker can only name a SHA that already
   exists, so a bundled move always lags by one.
4. Before merging the "Version Packages" PR, confirm `.changeset/` on `main` is empty of feature
   changesets and re-read the computed version number.

Expected landing zone: **~22.55 kB IIFE / ~22.33 kB ESM**, down from 22.82 / 22.42.

## Alternatives considered and rejected

| Option                                      | Why rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reach 18–20 kB**                          | Verified by building `5c2e414` on the same machine: pre-blast-radius is **18.71 kB IIFE**, today is 22.67 kB. 18 kB _is_ the bundle before hotspots existed. The entire behaviour-preserving inventory is 278 B — 11% of the way to 20 kB. Owner decision 2026-08-15: decline on measured evidence, take the 278 B, keep every capability.                                                                                                                                                                                                                                         |
| **Full motion capture + ancestor walk**     | Three of five real notes are about motion or layout and their `Computed:` line is dead weight — this is the largest observed note class going unserved, and that is worth stating plainly rather than calling it "no outcome change". But element-only capture reports nothing for note 4 (the animation is on the parent), the ancestor variant breaks the stated `anchor.ts` agreement that selectors, fingerprint, name, role and styles all describe the same element, and it needs its own labelled line plus `storage.ts` validation work. Owner decision: `textAlign` only. |
| **Coalesce members to the covering parent** | Re-creates the exact bug 0.8.0 shipped to fix. Breaks the headline acceptance criterion and pinned tests. The parent is recoverable as the shared css prefix of the named children.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Drop grazed siblings from `excluded`**    | Softens note 3 by deleting evidence; the split survives and gets harder to notice. Superseded by 1.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Tolerant `containerFor`**                 | A tolerant container can return an ancestor that does not contain the region, and `visit()` clips every child against `boxOf(boundary)` — so the parts of the region outside the boundary box vanish from every coverage ratio, shrinking members and inflating exclusions. Would also need mirroring in `annotator.ts` or the anchored element and the scope boundary get chosen under different rules. 1.1 removes its worst visible consequence for free.                                                                                                                       |
| **`**Related:**` cross-comment line**       | Notes 4 and 5 are two independent rules in two components; separate fixes are correct. Costs an O(n²) route-group pass, must route a comment id through `inline()` or the AST guard fails, and `getCssPath`'s six-segment cap produces unrooted paths that silently fail prefix matching.                                                                                                                                                                                                                                                                                          |
| **Lengthen `COVER_MAX` from 40 to 80**      | Amplifies D1 rather than fixing it — 40 more characters of pointing at the wrong element. Revisit only after 1.1 lands.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Reorder fields, quote first**             | Free and mildly better, but the consumer is an LLM reading a whole comment block, not a human doing a linear pass. Changes no edit and moves every snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Screenshots**                             | Rejected twice already (see origin). Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## System-wide impact

**Interaction graph.** `_placeAreaComment` → `resolveScope` → `visit`/`climb` → `describe` → `Scope` on
`Comment` → `storage.normalizeComments` (hydration) → `export.scopeLines` → the four `agent/` formats.
1.1 touches only the first hop and only the `covers`/`deep` values. 1.2, 1.3, 2.1 and 2.2 change what
`Scope` carries, so they cross the storage boundary and the format-parity boundary together.

**API surface parity.** `tests/agent/format-parity.test.ts` polices four `agent/` files. Any change to
artefact fields is a protocol edit and the pack must change in the **same commit** — 1.4 and 2.1 both
qualify. `tests/types/packed-consumer.test.ts` typechecks a `PinflowConfig` literal against the emitted
`.d.ts`; nothing here removes a public config option, so it should stay green untouched.

**State lifecycle and persistence.** 1.2, 1.3 and 2.2 change the meaning of `confidence` and add a
member-relationship note, so they need **`SCOPE_GEN = 2`, bumped once, for all of them together**.
Bumping across separate releases would give gen 2 two different meanings — exactly the corpus
fragmentation the field exists to prevent. Confirm they ship as one release.

**Error propagation.** No new failure modes. `scope.excluded` is a non-empty tuple; any filter over it
must guard on the filtered length, not the original, or the type lies.

**Integration scenarios unit tests will not catch.**

1. A record written by a gen-1 build, hydrated by a gen-2 build — `confidence` must not be
   re-interpreted, only read.
2. A CDN-IIFE page and an ESM app writing the same `localStorage` key: mangled names are frequency-
   derived **per entry point**, so any new persisted key must be unprefixed and quoted-access safe.
3. A marquee over a virtualised list where `EXCLUDED_CAP` trips (2.2's real target).
4. A `source()` payload carrying a hand-authored `context.styles` with a hostile `textAlign`.
5. A page with `data-pinflow-source` on an ancestor but not the boundary (2.3's real target).

## Acceptance criteria

### Functional

- [ ] Re-exporting the same five notes on the same page yields an `Area covers` for note 3 that names
      `ul.callouts`, not the code card.
- [ ] Note 2 retains `confidence: medium`; notes 1 and 5 report `low`. Not all five notes read `low`.
- [ ] Note 4 gains a `Change` block naming the `<pre>`, with boundary `section.well:nth-of-type(2)` at
      `rung: repeated`.
- [ ] Note 3's `Scope` line carries `2 of 5 <li> in the same list`.
- [ ] No `Area covers` value in any export is a leaf inline element's text.
- [ ] The `PREAMBLE` no longer contains "Never edit anything under", and the four `agent/` files match.
- [ ] `textAlign` appears in `Computed:` only when non-default.

### Non-functional

- [ ] `pnpm size` on **CI** reports IIFE ≤ 22.60 kB and ESM ≤ 22.40 kB before the final ratchet.
- [ ] Final ceilings are set from the CI figure + ~50 B, in a follow-up commit, and are **lower** than
      22.82 / 22.42.
- [ ] No ceiling raise at any point in the branch.
- [ ] `src/core/**` coverage stays ≥ 80%.

### Quality gates

- [ ] Full battery green on **the exact SHA pushed**: `pnpm test`, `pnpm test:coverage`,
      `pnpm typecheck`, `pnpm test:e2e`, `pnpm format:check`, `pnpm wiki:check`, `pnpm size`.
- [ ] `tests/core/scope.test.ts`'s zero-underscore mangling-invariant test green.
- [ ] `tests/voice/bundle-isolation.test.ts` green against a **CI-built** dist, not a local one.
- [ ] Changeset present. Wiki updated via `.claude/skills/wiki-update`, `.last-sync` moved last.

### Tests to write first (TDD)

| Phase | Failing test                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------ |
| 1.1   | `annotator-area-footprint.test.ts` — a rect over one grid column names that column's list, not the section's first child |
| 1.1   | `annotator-area-footprint.test.ts` — `covers` never names an inline-only element                                         |
| 1.2   | `scope.test.ts` — a marquee boundary holding a minority of the document's elements keeps its rung confidence             |
| 1.2   | `scope.test.ts` — a marquee boundary holding a majority demotes to `low`                                                 |
| 1.2   | `scope.test.ts` — a point pin inside a tall section keeps `repeated`/`medium` and seeds the pinned member                |
| 1.3   | `export-scope.test.ts` — members sharing a parent with unlisted same-tag siblings render `N of M`                        |
| 1.4   | `export-scope.test.ts` — `expect(render(REGION)).not.toMatch(/Never edit anything under/)`                               |
| 1.5   | `anchor.test.ts` — `textAlign` present when non-default, absent when default                                             |
| 2.1   | `export-scope.test.ts` — a label at `LABEL_MAX` renders with `…`                                                         |
| 2.2   | `scope.test.ts` + `storage.test.ts` — hitting `EXCLUDED_CAP` sets `truncated` and demotes                                |

## Success metrics

- **Primary:** the ≥80% locate-and-propose bar from the origin document, re-measured on a fresh export
  of the same page. Today 4/5 with one silent wrong-edit; target 5/5 with none.
- **Secondary:** `confidence` is monotone with usefulness — no note reports `medium` on a page-wide
  boundary, and no tight boundary reports `low` while a wide one reports `medium`.
- **Budget:** ceilings ratchet down by ≥150 B net with zero capability removed.

## Dependencies and prerequisites

- Branch `claude/pinflow-hotspots-quality-44ba76`, worktree at
  `.claude/worktrees/pinflow-hotspots-quality-44ba76`. Base `d2c2dc9` (v0.8.1).
- Phase 2.4 requires the **separate** `pinflow-site` repo.
- `SCOPE_GEN = 2` must be agreed before 1.2/1.3/2.2 land.
- Local `node_modules` and `dist` are gitignored and were absent on arrival; `pnpm install` is needed
  before any measurement.

## Risk analysis and mitigation

| Risk                                  | Evidence                                                                                                                                                            | Mitigation                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A byte figure quoted here fails on CI | Every number in this plan is macOS local; the gap scales and is ~100 B IIFE at 22 kB                                                                                | Push-read-ratchet in Phase 3; never predict the gap                            |
| Per-cut golf figures do not add up    | Individual cuts moved −14 to +6 B when stacked while the bundle moved 5 B                                                                                           | 0.2 lands as ONE commit and is quoted as a bundle                              |
| A "dedupe" grows the bundle           | Measured three times here: converting tag Sets to a shared `includes()` helper **grew** the bundle 23 B IIFE; `charset:'utf8'` cut 140 raw bytes and grew gz by 9 B | Re-measure after every commit; raw and gz can move in opposite directions      |
| 1.2 demotes the good note             | The naive `tooWide` reuse does exactly this                                                                                                                         | Descendant-share only; assert note 2 keeps `medium` as an acceptance criterion |
| `SCOPE_GEN` bumped twice              | 1.2, 1.3 and 2.2 each independently need it                                                                                                                         | One bump, one release; stated in the changeset                                 |
| Pack and artefact contradict          | `agent/` ships in `package.json` `files`; `format-parity.test.ts` polices it                                                                                        | 1.4 and 2.1 edit the pack in the same commit                                   |
| Deleting nothing but moving coverage  | 80% gate on `src/core/**`; refactors move branch coverage either way                                                                                                | `pnpm test:coverage` on the pushed tree                                        |
| Stale version PR burns the release    | 0.7.0 and 0.8.0 both exist in git and `CHANGELOG.md` and never published                                                                                            | Check `.changeset/` is empty before merging; re-read the computed number       |

## Documentation plan

- `docs/wiki/core.md` — the descendant-only R4 rule in the region branch, and why `MAX_VIEWPORT_SHARE`
  is not used there.
- `docs/wiki/api.md` — `textAlign` in the computed snapshot; the `N of M` scope note.
- `docs/wiki/build-and-release.md` — add the measured counter-example that **raw and gz can move in
  opposite directions**, beside the existing gzip-dedup lesson.
- `AGENTS.md` — nothing required; the existing size-gap invariant already covers Phase 3.
- Changeset — user-facing artefact wording change (1.4), new scope note (1.3), new computed property
  (1.5), `SCOPE_GEN` bump.
- `README.md` + pack — `data-pinflow-source` instrumentation guidance (2.4).

## Sources and references

### Origin

[`docs/brainstorms/2026-08-06-blast-radius-0.5.0-requirements.md`](../brainstorms/2026-08-06-blast-radius-0.5.0-requirements.md)
is the origin of the **feature**, not of this fix; this plan corrects it against real-world evidence.
Decisions carried forward: **R4 applies to every rung** (violated in the region branch — D2); **scope is
binding with a declared escape hatch** (the exclusion set never got the escape hatch — 1.4); **R6's
collapse rule was replaced because it re-creates the bug** (why coalescing is rejected); **thresholds
are unresolved research to be tuned on real pages** (this audit is the first such data); **no
screenshots**; terminology is **scope**, "blast radius" is prose only.

### Internal

- Sprint plan: [`docs/plans/2026-08-06-001-feat-blast-radius-scope-model-plan.md`](./2026-08-06-001-feat-blast-radius-scope-model-plan.md)
  — `SCOPE_GEN` exists precisely so thresholds can be retuned; `export.ts` must never import `scope.ts`;
  zero `_` in `scope.ts`. Note the plan titles itself 0.5.0 but the work **shipped as 0.8.0** (merge
  `a8928a4`, PR #6, 2026-08-14).
- Sibling release: [`docs/plans/2026-08-06-002-fix-csp-heal-export-honesty-plan.md`](./2026-08-06-002-fix-csp-heal-export-honesty-plan.md)
- Audited artefact: `pinflow-feedback-Brij-pinflow-dev-2026-08-15T20-50-23-940Z.md` (5 notes, route `/`,
  1800×933).
- Ceiling trajectory: 0.2.x 13.50 → 0.4.1 17.40 → 0.5.0 17.95 → 0.7.0 18.79 → **0.8.0 22.76** → 0.8.1
  22.82. Pre-blast-radius tree `5c2e414` rebuilt on the same machine: **18.71 kB IIFE / 18.38 kB ESM**.
- Bundle attribution (IIFE, marginal gz): `ui/annotator.ts` 7,386 (32.6%) · `export.ts` 2,711 ·
  `ui/styles.ts` 1,754 · `storage.ts` 1,639 · `scope.ts` 1,591 · `selector.ts` 1,301 ·
  `gesture/controller.ts` 862 · `anchor.ts` 590. `types.ts` contributes 0 B — pure types, correctly
  erased.
- Reviewed site: `github.com/brijeshp/pinflow-site` — `Hero.astro`, `Artifact.astro`, `UseCases.astro`,
  `global.css`.
