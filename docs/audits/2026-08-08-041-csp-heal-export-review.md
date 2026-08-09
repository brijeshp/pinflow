# 0.4.1 — review log

Scope: `main...fix/041-csp-heal-export-honesty`. Three parallel internal review
agents in fresh contexts, each with a distinct lens, then re-verification by the
same reviewer after each fix round.

Both substantive reviewers worked by **measurement rather than reading** — one
built a throwaway git worktree and ran `main`'s `selector.ts` against the
branch's on adversarial fixtures; the other bundled the real `export.ts` with
esbuild and pushed 17 crafted `Comment` records through `exportReviewer()`. Every
finding below is an observed differential.

## Round 1 — heal ladder (`selector.ts`) — CHANGES_REQUESTED

| #   | Finding                                                                                                                                                                                                                                                                                                                | Fix                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `return exact ?? best ?? positional` let a 0.6-similarity stranger outrank a hit css **and** xpath agreed on. `_persistHeal` then wrote it to `anchor.selectors`, so the next load corroborated the stranger trivially and the original anchor was unrecoverable. Trigger: a reviewer asking for copy to be rewritten. | Reordered to `exact ?? positional ?? best`.                                                                                         |
| P1  | The in-code claim _"we never lose a match we had before"_ was **false**, and the reviewer's probes falsified it.                                                                                                                                                                                                       | Replaced with an honest comment naming the undecidable visible-duplicate case, plus a zero-box guard for the common hidden variant. |
| P2  | The walk stopped being bounded. Skipping non-descendants with `continue` walked the rest of the document, and skipped nodes charged no budget: **16,002 of 16,005 elements** visited against `main`'s 2,001. The optimisation was slower than no optimisation.                                                         | `break`, not `continue` — pre-order makes the match's subtree contiguous.                                                           |
| P2  | `SKIP_TAG_RE` never matched an SVG `<title>`: `tagName` preserves case outside the HTML namespace. The list was also entirely inert in XHTML.                                                                                                                                                                          | Match against an uppercased tag; add `DESC`/`METADATA`.                                                                             |
| P3  | `(root as Document).body` redirected the walk for an Element root exposing a named `.body` (a `<form>` with a control named "body"). Latent — every live call site passes a Document.                                                                                                                                  | Gated on `nodeType === 9`.                                                                                                          |
| P3  | Deadline sampled every 64; a body-seeded walk meets the largest containers first.                                                                                                                                                                                                                                      | Every 16.                                                                                                                           |
| P3  | In-file perf claim said 81x.                                                                                                                                                                                                                                                                                           | Corrected to ~2.8x end-to-end, naming `textContent` as the irreducible floor.                                                       |

Fixed in `69c648b`. 3 tests traced RED first.

## Round 2 — heal ladder — APPROVED

All four verified fixed by three-way measurement (`main` / R1 / new):

```
I1  stranger -> #real            J1  16,002 visited -> 3
C1  main 2,001/6.5ms  R1 8,002/9.5ms  NEW 3/2.2ms
E3  <form>.body ORPHAN -> P      G1  zero-box <title> -> <svg> (has a box)
```

**The `break` was attacked specifically and survived**: 700 randomised DOMs (300
nested, 400 wide-and-shallow) with zero divergence from `main`, plus targeted
`<template>`, shadow-DOM, and deeper-non-descendant shapes. Pre-order contiguity
holds by spec — `createTreeWalker` with no filter yields strict document order.

Cadence verified exactly: `1 + 2000/16 = 126` `now()` calls, last sample landing
at `count=2000` immediately before the cap. No off-by-one.

Two new P2s, both fixed in `95c5e37`:

- **Charging skipped tags starved the scored budget** — 1,500 `<source>`
  elements in a gallery evicted real content and the heal landed on the page
  container, a wrong attach. Split into two counters: `visited` bounds work,
  `count` bounds meaning. (The reviewer noted this came from their own round-1
  wording.)
- **The zero-box guard shipped with zero coverage** — happy-dom returns one rect
  for everything, including detached nodes. Reachable by stubbing the layout
  read; now tested in both directions.

Carried forward, not done here: gating `_persistHeal` on the resolved element
corroborating the stored fingerprint, which would make an undecidable heal
_transient_ rather than permanent. Cross-file, and the right shape for 0.5.0.

## Round 1 — security — CHANGES_REQUESTED

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Fix                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| P1  | `textFingerprint` rendered through `inline()` inside a quote-delimited segment on the **same line** as the `attr()`-protected attribute — and it is raw element text. A crafted fingerprint emitted a complete second element label, so `/data-testid="([^"]*)"/g` yielded an attribute pinflow never emitted. **The two tests guarding `attr()` passed only because `labelOnly()` defaulted the fingerprint to `''` — they avoided the field that breaks them.** | `attr()` applied; the parameter is now required.                                                                               |
| P1  | The agent pack routed page-controlled strings into tool arguments — _"grep the codebase for it"_ where a testid can be `--pre=/bin/sh`, or can carry a quote that `code()` **itself synthesises** (backtick → `'`).                                                                                                                                                                                                                                               | All four formats require literal fixed-string search, forbid a value beginning an argument, and forbid fetching artifact URLs. |
| P2  | `attr()` left `<` and `>`, so `/<(\w+)[^>]*>/` terminated the pseudo-tag early.                                                                                                                                                                                                                                                                                                                                                                                   | Both mapped to single guillemets.                                                                                              |
| P2  | `ctx.src` and `styles.backgroundImage` are raw page URLs rendered bare with `inline()`.                                                                                                                                                                                                                                                                                                                                                                           | `code()`.                                                                                                                      |
| P2  | The slash command scoped the boundary to _"the quoted text"_ — and `README.md` advertises installing that file alone.                                                                                                                                                                                                                                                                                                                                             | All four formats say every field.                                                                                              |
| P3  | Untrusted list omitted selectors/URLs/styles/resolutions; testid called _"a deliberate, author-placed handle"_; README claimed the escaping stops forging "markdown structure" when it stops headings and sections, not inline corruption.                                                                                                                                                                                                                        | All corrected.                                                                                                                 |

**One round-1 finding was rejected.** The P3 claiming 450 B of unearned budget
headroom measured a stale build; rebuilt from HEAD the numbers are 14.93/15.0
and 14.58/14.65 — 70 B, consumed by the fixes. Verified before dismissing.

Checked and found sound by the reviewer: `tagFromCss` → `code()` is complete (no
CSS path unbalances the span); `attr()` covers both intended sites and orphan
blocks reuse `elementLabel`; `describeRoute` labels cannot fabricate headings;
the confirmation panel interpolates no untrusted value and uses `textContent`,
not HTML; `quoted()` terminates correctly; packaging ships exactly the intended
37 entries with no `demo/`, `docs/`, `.claude/` or scratch files, and no
`/Users/` anywhere in `dist/`.

## Round 2 — security — CHANGES_REQUESTED

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                | Fix                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1  | **The tag was the third interpolation on the label line and was still on the baseline escaper.** Round 1 fixed the attribute, round 2 the fingerprint; both left the tag. A stored css path forged an attribute the **non-global** regex returns _first_. Reachable via `source()`, an imported export, or tampered `localStorage` — `storage.ts` validates `selectors.css` as `typeof === 'string'` and nothing more. | `attr(tag)`.                                                      |
| P2  | The backtick gap was a **class**, not two fields: accessible name, nearest heading, `font-family`, resolution and comment id were all live. `font-family` is the sharpest — `visualSnapshot` strips only outer quotes, so `font-family: "a\`b"` put a raw backtick in the artifact.                                                                                                                                    | Folded backtick handling into the baseline; **deleted `code()`**. |
| P2  | The pack forbade shell interpolation and then supplied `rg -F -- '<value>'` — a single-quoted shell string, when the escapers _synthesise_ single quotes. The template is the part that gets copied.                                                                                                                                                                                                                   | Tool-call form first in all four formats; template removed.       |
| P3  | The rules file scoped the shell rule to selector values only; `**Element:**` was not described as a display rendering; a mid-line `**Label:**` was not called out.                                                                                                                                                                                                                                                     | Aligned across all four.                                          |

Fixed in `984b1e6`. Deleting the helper paid for itself: **14.93 → 14.91 KB gz**.

## Round 3 — security — APPROVED

Brute-forced **6,859** tag × testid × fingerprint combinations under both regex
forms: **0 escapes**, and 0 raw backticks or angle brackets surviving anywhere
in the label. All 20 interpolation sites confirmed routed; 17 fields probed for
backtick parity, 0 unbalanced.

Three non-blocking findings, landed anyway in `2a311dd`:

- **P2** — the `id=` branch still yielded a spurious capture (342/6,859): with no
  testid, the id's own closing quote paired with the fingerprint segment's
  opening one. Not exploitable — `attr()` means the captured span is always
  pinflow's own `>` (`and the attacker can neither lengthen nor choose it — but
it broke a stated invariant, and **the property test hardcoded a testid, so
the failing arm was the uncovered one.** Third round running, the uncovered
arm was the one that failed. Fixed with typographic quotes on the fingerprint,
removing the last free ASCII`"` from the line.
- **P3** — removing the `rg -F` template had silently dropped the fixed-string
  requirement. Without `-F` a page-controlled value is a **regex**: `.*` matches
  the whole tree. Restored.
- **P3** — "verbatim" was false for exactly one character, since `selectorLines`
  also substitutes backticks. Corrected in the wording, not the code:
  `selectorLines` must stay faithful because the pack now points searches there.

Also added the structural test round 3 asked for: every `${…}` in `export.ts`
must route through an escaper, asserted against the source.

## Process notes

**The escaper decision was the root cause, and enumeration never caught it.**
Three security rounds each fixed the fields someone remembered and each missed
one: the attribute, then the fingerprint, then the tag — plus a class of six
that nobody had looked at. The per-field question "which escaper does this one
need?" was the defect. Round 2 deleted the question by folding backtick
handling into the baseline, and round 3 replaced the enumerative tests with a
structural one asserted against the source. That test would have caught all
three misses; no list of fields could have.

Five times this branch produced **a test that passed for the wrong reason**,
each caught before merge:

1. `delivers the interactive rule via adopted` passed against the unbroken code,
   because `createUIRoot('adopted')` ignored the parameter and the assertion
   accepted _any_ delivery channel. Rewritten to require the requested channel.
2. The `attr()` guards passed because `labelOnly()` defaulted the fingerprint to
   `''`. Found by the security reviewer, not by me.
3. The image-src test used **paired** backticks, which balance — it passed
   against the bug. Fixed to an odd count before implementing.
4. The element-label property test hardcoded a testid, leaving the `id=` arm
   unexercised — and that was the arm still failing. Found in round 3.
5. Two new selector tests were **flaky by construction**: they walk thousands of
   nodes while the real 2 ms deadline runs, so a loaded machine fails them for
   an unrelated reason, and an early deadline would have made one pass without
   the fix. Both now freeze the clock.

That is the same failure mode as the pre-existing assertion this release
started by fixing (`export.test.ts` asserting no fabricated heading, which
passed while the code span was corrupt). Structural assertions are not
automatically honest ones; the input has to be able to break them.

**Resolved after merge, by CI.** Two full-suite runs had failed transiently out
of ~83, never captured by name. I attributed them to machine load from the
review agents and recorded the item rather than dismissing it — which was the
only correct part of my handling. It was a real defect, and I pinned the clock
in the wrong two tests.

The culprit was `abandons the walk when the time budget is exhausted`. Its
**control** assertion — the "finds it normally" baseline before the mock — walked
300 rows against the **live 2 ms deadline**. On a slower runner the budget fires
legitimately, the walk returns null, and the baseline fails. A test about a
deadline was racing one. It passed ~80 consecutive local runs and failed on the
first CI run.

Fixed by pinning the clock across both halves, plus a mechanical audit of every
`findByCandidates` fixture over 30 nodes confirming all three now pin it. The
fix is structural rather than statistical: with `now()` frozen at 0 the deadline
is 2 and can never elapse.

**The lesson is the same one as the five wrong-reason tests, in the other
direction.** Those passed when they should have failed; this one failed when it
should have passed. Both come from a test whose outcome depends on something it
does not control — and 80 green runs is not evidence of determinism.

## Battery at verdict

392 unit passed / 2 CI-only skips, 27 e2e across chromium + mobile-chrome +
mobile-safari, coverage above the 80/75 gate, typecheck clean, format clean,
`wiki:check` in sync. All five bundles under ceilings: IIFE 14.92/15.0, ESM
14.57/14.65, voice 4.43/4.45, react 468/470, vue 604/610. Four patch changesets
present. Live browser proof of the CSP fix under `style-src 'self'`.

Five review rounds across two lenses: heal ladder CHANGES_REQUESTED → APPROVED,
security CHANGES_REQUESTED → CHANGES_REQUESTED → APPROVED.
