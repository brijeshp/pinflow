# 0.6.1 — coarse-container anchors: independent review request

**Read this whole file before starting. It is self-contained; you are not
expected to have prior context on this repo.**

Repo: `github.com/brijeshp/pinflow` (public, MIT). A ~18 KB gz zero-dependency
browser script that adds pin-and-comment annotation to any web page and exports
Markdown intended to be pasted into a coding agent.

**Under review:** branch `fix/061-degenerate-anchors`, PR #5.

|       |                                                                                               |
| ----- | --------------------------------------------------------------------------------------------- |
| Base  | `90b4e8c35cc54d5737811ac2044a8e13247ac419` (= `origin/main`, 0.6.0)                           |
| Head  | `2c03e6d1df0d8f39927517ad204d84a7a04897f8`                                                    |
| Range | 3 commits, 19 files, +619/−31 (src/tests/agent/package.json: 14 files, +586/−21)              |
| CI    | green on head (provenance, format, typecheck, build, 597 unit + coverage, size, wiki, 51 e2e) |

Review mode: **read-only**. Do not implement fixes; report findings with
severity and evidence. If you disagree with a decision recorded here, say so —
several were contested during design and the losing options are documented in
§6 so you can re-open them with new information rather than re-deriving them.

---

## 1. The defect this fixes, in the reporter's own words

A user pinned three comments on `pinflow.dev` and asked whether the artifact was
actionable. It was not. Two of three anchored to `#main`:

```
**Element:** `<element id="main">` (“Live on this page Put feedback directly on the page. Give your coding agent exac”)
**Context:** the ‘Live on this page Put feedback directly on the page. Give your coding agent exac’ main
**Computed:** text oklch(0.46 0.105 194), font 17px Instrument Sans Variable
**Position:** 34% from left, 72% from top of element
**Area:** 23% × 3% of the element, from 47%, 69%
```

Measured on the live page: `#main` is **7029 px** tall. So the quoted preview is
the first 80 characters of the _whole page_ (the hero), while the comment is
about content ~5000 px lower. `**Position:** 72%` is 72% of 7029 px.
`**Computed:**` is the container's inherited styles. An agent reading this in
good faith edits the hero.

Two distinct causes, both confirmed by probing the live DOM with
`elementFromPoint`, not by inspection:

1. **Point pin in a gutter.** The reviewer clicked between two cards.
   `document.elementFromPoint` genuinely returns `<main>`. The widget stored the
   only element under the pointer. Correct, and useless.
2. **Marquee spanning siblings.** The rect's centre sits on a real
   `<li class="scene card">`, but a rect spanning siblings has no tight common
   ancestor, so `_placeAreaComment`'s `while (!contains(e)) e = e.parentElement`
   climb reaches `#main`.

Plus one cosmetic bug: `<element id="main">` is not an HTML tag. `export.ts`'s
own `tagFromCss` splits the last css segment on `[.:#[]`; an id-anchored path is
bare `#main`, which splits to `''`, so the `|| 'element'` fallback fired.

---

## 2. What changed

| ID  | Change                                                                                                                     | Files                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| S1  | Element label recovers the tag from the xpath's last step when the css path carries none                                   | `export.ts`                                           |
| S2  | A preview that hit `FP_MAX` (80) now ends `…`                                                                              | `export.ts`                                           |
| S3  | New optional `Anchor.covers`: up to 3 labels of the blocks a marquee rect actually sampled, rendered as `**Area covers:**` | `types.ts`, `annotator.ts`, `storage.ts`, `export.ts` |
| S4  | `nearestHeading` reads from the block under the rect, restoring the `under ‘…’` clause                                     | `anchor.ts`, `annotator.ts`                           |
| S5  | A `null`/absent `textFingerprint` drops that record instead of throwing during hydration                                   | `storage.ts`                                          |
| S6  | Agent pack teaches the container case (zero bundle bytes)                                                                  | `agent/**` (4 files)                                  |

Resulting block for the reported comment:

```
**Element:** `<main id="main">` (“Live on this page Put feedback directly on the page. Give your coding agent exac…”)
**Area:** 23% × 3% of the element, from 47%, 69%
**Area covers:** “Production websites”, “Client review on staging”, “Design QA”
**Context:** the ‘…’ main under ‘If you can add the script, you can pin feedback.’
```

---

## 3. Where to look hardest

Ranked by blast radius. These are the places I would attack.

**(a) The climb refactor in `_placeAreaComment` — highest risk in the change.**
0.6.0 resolved the centre with `elementFromPoint` + an ancestor climb and
discarded the pre-climb element. The refactor lifts that into a `climb(x, y)`
closure that keeps the last element before the loop stopped, then calls it three
times (centre, then the 1/6 and 5/6 diagonal insets). **The centre call must
reproduce 0.6.0 byte-for-byte** — same `target`, same `anchorEl`, same
`areaPercent` — or every stored area comment silently changes meaning. There is
a regression test pinning this (`leaves the anchor and areaPercent exactly as
0.6.0 computed them`), written before the refactor. Verify the equivalence by
reading, not by trusting the test: does any ordering, the host guard, or the
`subjects` bookkeeping perturb the returned element in a case the test misses?

**(b) The new interpolated field is prompt-injection surface.** `**Area covers:**`
carries raw page text into the artifact. The discipline is **split first, then
`attr()` each item**, because `inline()` strips newlines _after_ the split — so
no entry can start a line and the field stays line-anchored and unforgeable like
`Status` and `Comment ID`. `.slice(0, 3)` bounds a hostile hydrated value (a
`source()` payload can supply 10,000 newlines). Attack it: can any input produce
a second `**Area covers:**`, an unbalanced backtick, a forged
`data-testid="…"`, or a `<`/`>` on that line? Test
`a hostile covers value cannot start a line or forge a label` asserts these; try
to defeat it.

**(c) The escaping-surface count.** `export.ts`'s `attr()` comment recorded "All
FOUR interpolations in the label" — a map three consecutive review rounds relied
on and which each round found stale. S1 adds a fifth (the xpath tag fallback);
the comment and `docs/wiki/core.md` were both moved to FIVE. Confirm no sixth
slipped in unrecorded.

**(d) Schema additivity.** `covers` is top-level on `Anchor`, validated with
`optStr`, no `SCHEMA_VERSION` bump. Check both directions: old records
(`covers === undefined`) must validate unchanged; a new store read by an old
build must keep the key through `normalizeComments`' spread; `_persistHeal`
spreads the rest of the anchor so `covers` survives a heal and then goes stale
(same contract as `context.styles`, stated in the JSDoc). **`covers` is
deliberately not `_`-prefixed** — it is persisted, exported, and read back from
untrusted input, i.e. all three arms of the mangling landmine in `AGENTS.md`.

**(e) S5 is a behaviour change, not just a crash fix.** Validation moved from
`optStr` to a strict `typeof === 'string'`. `buildAnchor` always writes a string
(possibly `''`), and there was never a working path for an absent one (it threw),
so nothing legitimate should be rejected — but confirm that reasoning against
`source()` hydration payloads, which are host-supplied and never passed through
`buildAnchor`.

**(f) Reflow cost.** The two extra `elementFromPoint` calls and their climbs run
**once, on `pointerup`**, inside `_placeAreaComment`. They must never touch
`_placeArea`, `_areaRect`, `_placePin`, `_repositionPins` or `_paintHover`.
happy-dom cannot prove this; the guard is that the diff touches none of those
methods. Verify by reading the diff, not the tests.

---

## 4. Verification already done (reproduce, don't trust)

```bash
git fetch origin && git checkout 2c03e6d1df0d8f39927517ad204d84a7a04897f8
pnpm install
pnpm test        # 597 pass, 2 skipped
pnpm typecheck
pnpm build && pnpm size
pnpm wiki:check
```

Sizes are the **linux CI** figures, not local (local macOS reads ~30 B lighter,
which is what made 0.6.0 fail CI by one byte):

| bundle       | ceiling  | CI actual | margin |
| ------------ | -------- | --------- | ------ |
| core IIFE gz | 18.18 KB | 18.13 KB  | 50 B   |
| core ESM gz  | 17.83 KB | 17.78 KB  | 50 B   |

Coverage on touched files: `anchor.ts` 100% stmts, `export.ts` 100%,
`storage.ts` 99.54%, `annotator.ts` 95.67%; all files 96.88% / 92.19% branch
(gate is 80% on `src/core/**`).

**The ceiling notch is owner-approved** and documented in the changeset, per the
budget policy in `AGENTS.md`. The delta is ~+210 B gz. If you think the feature
is not worth 210 B, say so — that is a legitimate finding, and the changeset's
cut ladder lists what to drop first.

---

## 5. Test inventory (30 new)

- `export.test.ts` — real tag from xpath; `'element'` when neither source has a
  tag; css tag wins over xpath; **hostile xpath cannot forge an attribute**
  (fifth arm of the existing injection matrix); ellipsis at cap / absent below
  it; `**Area covers:**` rendering, omission, orphan-block inclusion, and the
  hostile-value guard.
- `anchor.test.ts` — a page-level anchor has no heading of its own (the reported
  defect); deep element supplies the heading; **only the heading moves** (guards
  the mixed-provenance design that was rejected).
- `annotator-marquee.test.ts` — three blocks named centre-first; **0.6.0
  equivalence**; gutter-only drag records nothing; dedupe and cap at 3; own
  chrome never listed; text-less block labelled by tag; **legitimate full-page
  pin still places, unchanged and un-refused**.
- `storage.test.ts` — `null`/absent/non-string fingerprint drops only that
  record; empty string kept; `covers` round-trips; old records without `covers`
  still validate; non-string `covers` drops the record.

happy-dom has no layout, so geometry is made deterministic with the file's
existing `mockRect`, `ptr` and a new coordinate-aware `elementFromPoint` stub.

---

## 6. Decisions taken, with the losing options

Re-open any of these if you have new information. Do not re-litigate on the
grounds already recorded.

- **No pin is ever refused or redirected.** The tempting fix — reject a coarse
  anchor, or descend to the nearest child — was rejected on four grounds, any
  one sufficient: it attaches feedback to an element the reviewer did not click
  (the repo's own stated principle is that a wrong anchor is worse than an
  honest orphan); it measured at +158 B against ~39 B of headroom at the time;
  it would force the hover-outline path through the same resolution or silently
  break the "preview = capture" invariant; and pinflow's own host is a
  `position:fixed;inset:0` child of `<body>`, so a children-descent reaching
  body picks it at distance 0. **Consequence, stated plainly: cause 1 is now
  labelled accurately, not fixed.** A gutter click still anchors to the
  container; the export just no longer lies about what that means. If you think
  that is the wrong trade, that is the single most valuable disagreement you
  could raise.
- **No warning UI.** There is no hint/toast vocabulary in the widget, and the
  armed hover outline on a 7029 px element renders both horizontal borders
  off-screen — it reads as "annotate mode is on", not as a warning.
- **Tag from xpath, not `context.role`.** `role` is
  `getAttribute('role') ?? tagName`, so `<div role="navigation" id="nav">` would
  render `<navigation id="nav">` — a factual misstatement of the tag in the one
  line agents grep. `context` is also optional on legacy records, whereas
  `selectors.xpath` is guaranteed by `hasValidAnchor`.
- **`deep ?? el`, not `deep ?? target`.** `target` can be deeper than the
  anchored element, and walking from deeper can surface a different heading on
  every _point_ pin — an unmeasured behaviour change in a patch release.
- **Only the heading is re-sourced from the deep element.** Sourcing `name`,
  `role` or `styles` from a different element than `**Element:**` names makes the
  block internally inconsistent with nothing to explain the mismatch.
- **Area comments keep anchoring to the containing ancestor**, rather than
  re-anchoring to a covered sibling: `AreaPercent` is contractually 0–100, so a
  rect spanning three siblings cannot be expressed relative to one without
  clamping away the fact that it covered three; and it would demote healing from
  the id rung to the positional rung on near-identical cards.
- **`covers` is a newline-joined string, not `string[]`** — purely for bytes; it
  rides the existing `optStr` chain. `getTextFingerprint` collapses whitespace,
  so a real label can never contain a newline.

**Known limitation, accepted:** the three samples run down the rect's diagonal,
so a marquee over a 2×2 grid can miss the anti-diagonal members. Per-candidate
`intersection / area >= 0.4` scoring would fix it for ~55 B.

---

## 7. Repo context you need

- `AGENTS.md` is the binding instruction layer. Invariants: pnpm only, **zero
  runtime dependencies**, size budgets are **hard ceilings**, core↔voice
  isolation, `_`-prefix mangling rules, TDD-first with an 80% coverage gate on
  `src/core/**`, changeset required, **no telemetry ever**, and no AI-agent
  attribution anywhere in the repo's own voice.
- Exported markdown is pasted into coding agents by end users, so annotation
  content is **untrusted input** and the escaping in `src/core/export.ts` is a
  prompt-injection guard. Never weaken it.
- `docs/wiki/` is the architecture reference; it was updated in this range and
  its `.last-sync` marker moved in its own final commit.

**One situational fact that matters.** A second 0.6.1 feature
(`feat/061-name-at-export`, anonymous reviewer handles) is in flight
_uncommitted_ in the main working tree and touches the same four files and the
same two bundles. This branch was deliberately built in an isolated worktree off
`origin/main` and does **not** include it. Whichever merges second needs a
rebase and a fresh CI size measurement — the 18.18 KB ceiling here is correct
for this change alone.

---

## 8. What a useful finding looks like

Severity-banded, with evidence:

- **P1** — data corruption, prompt-injection hole, a stored-anchor meaning
  change, a crash, or a size-gate breach.
- **P2** — a real defect with a bounded blast radius, or a test that asserts the
  wrong thing.
- **P3** — clarity, naming, a stale comment or wiki claim.

For each: the file and symbol, the input that triggers it, the observed vs
expected behaviour, and — if you can — the failing assertion. A finding I can
reproduce in one command is worth ten I have to reconstruct.

Explicitly welcome: "the regression test for (a) does not actually constrain X",
"the escaping in (b) is defeated by Y", and "this feature is not worth 210 B".
