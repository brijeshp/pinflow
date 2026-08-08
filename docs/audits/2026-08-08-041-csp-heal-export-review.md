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

## Process notes

Three times this branch produced **a test that passed for the wrong reason**,
each caught before merge:

1. `delivers the interactive rule via adopted` passed against the unbroken code,
   because `createUIRoot('adopted')` ignored the parameter and the assertion
   accepted _any_ delivery channel. Rewritten to require the requested channel.
2. The `attr()` guards passed because `labelOnly()` defaulted the fingerprint to
   `''`. Found by the security reviewer, not by me.
3. The image-src test used **paired** backticks, which balance — it passed
   against the bug. Fixed to an odd count before implementing.

That is the same failure mode as the pre-existing assertion this release
started by fixing (`export.test.ts` asserting no fabricated heading, which
passed while the code span was corrupt). Structural assertions are not
automatically honest ones; the input has to be able to break them.

**Open, non-blocking:** two full-suite runs failed transiently out of ~83, both
while heavy background review agents were running, and neither was captured by
name. 70 consecutive clean runs after pinning the clock in two timing-sensitive
tests. Recorded rather than dismissed — if it recurs in CI it will be visible
there.

## Battery at verdict

388 unit passed / 2 CI-only skips, 27 e2e across chromium + mobile-chrome +
mobile-safari, coverage 96.12% lines / 92.22% branches (gate 80/75), typecheck
clean, format clean, `wiki:check` in sync. All five bundles under ceilings:
IIFE 14.93/15.0, ESM 14.58/14.65, voice 4.43/4.45, react 468/470, vue 604/610.
Four patch changesets present. Live browser proof of the CSP fix under
`style-src 'self'`.
