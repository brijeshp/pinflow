# 0.4.1 — independent review request (two reviewers)

**Read this whole file before starting. It is written to be self-contained; you
are not expected to have any prior context on this repo.**

Repo: `github.com/brijeshp/pinflow` (public, MIT). A ~15 KB zero-dependency
browser script that adds pin-and-comment annotation to any web page and exports
Markdown intended to be pasted into a coding agent.

Under review: `main`, everything since **`3044d1c`** — 26 commits, 58 files,
+2991/−171 (of which `src/`, `tests/`, `agent/` and `.github/` account for 36
files and +1251/−144; the rest is planning and audit prose).

**Release status, which is unusual and worth understanding before you start.**
The version PR was merged, so `package.json` says `0.4.1` on `main` — but **npm
is still on `0.4.0` and nothing has shipped**, because CI went red on the merge
commit and the publish job sits behind it. The cause was a defect in the repo's
own tooling, fixed in the final commit of this range: `wiki-check.mjs` counted
`package.json` and `.changeset/` as code paths, and the changesets bot's
"Version Packages" commit necessarily touches both — so **every** release would
have failed this way. Verify that fix as part of your review; it is the one
change here that has never had a second pair of eyes.

---

## Why you are being asked

This release already passed two internal review lenses over five rounds, and
those reviews were good — between them they found two P1 data-corruption bugs
and a P1 prompt-injection hole, all confirmed by measurement.

**The problem is the verification, not the findings.** Over the course of this
work the implementer produced **five tests that passed for the wrong reason** —
tests that were green against the broken code they claimed to guard. Two were
caught by reviewers rather than by the implementer. In the same session a wait
loop reported success because the thing it waited for had not started, and a
`grep` reported "clean" because the command had failed rather than found
nothing.

That is one repeated error shape: **a check that passes for a reason other than
the one intended.** Every green signal in this release was produced by the
process that keeps making that mistake. So the question you are answering is not
"is the code good" — two reviewers already said yes — it is:

> **Is the evidence that the code is good actually evidence?**

Assume nothing in the commit messages, the audit log, or the wiki is true
because it is written down. Where a claim is checkable, check it.

### Calibration: the five known instances

Read these first. They are the pattern you are hunting, and each is now fixed —
they are here to tune your eye, not to be re-reported.

| #   | Test                                                                                           | Why it passed while broken                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `tests/core/dom.test.ts:70` "delivers the interactive rule through the requested %s channel"   | Asserted that _some_ channel delivered the CSS. The parameter was ignored by the pre-fix code, so the assertion fell through to the working branch.    |
| 2   | `tests/core/export.test.ts:703` "a double quote in a testid cannot forge a second attribute"   | Its helper defaulted `textFingerprint` to `''` — avoiding the one field that could still forge an attribute. Found by a reviewer, not the implementer. |
| 3   | `tests/core/export.test.ts:659` "a hostile image src cannot open a code span"                  | Used **paired** backticks, which balance. The hole needs an odd count.                                                                                 |
| 4   | `tests/core/export.test.ts:564` "no interpolation in the element label can forge an attribute" | Hardcoded a `testid`, leaving the `id=` branch unexercised — and that was the branch still failing.                                                    |
| 5   | `tests/core/selector.test.ts:460` "abandons the walk when the time budget is exhausted"        | Its **control** assertion raced the real 2 ms deadline it was testing. Passed ~80 local runs, failed the first CI run.                                 |

Note the shape they share: in each case the _input could not reach the defect_.
The assertion was fine. The fixture was the lie.

A sixth, found while writing this document and worth naming because it is the
same family pointing the other way: the harness written to verify the
`wiki-check.mjs` fix used **working-tree** edits, while `wiki-check` diffs
**commit-to-commit** — so two of its four cases could not reach the code they
claimed to test and reported success having proved nothing. A third case ran
against the _unfixed_ script because a `git stash` had reverted it. Re-done
against real commits on a throwaway branch, it also surfaced a genuine bug in
the fix (one half read the working tree while the other read commits).

**So: be suspicious of harnesses, not just of tests.** If a check cannot fail,
find out why before believing it.

---

## Ground rules

- **Measure, don't read.** Both prior reviewers worked by building a scratch
  worktree and running the old and new implementations side by side on
  adversarial fixtures. That is why their findings held. Reasoning about the
  diff is much weaker here and has already failed once.
- **Do not modify the working tree.** Use `git worktree add` on a temp path, or
  `git show <sha>:<path>`. Report only.
- **Prefer refutation.** For any claim you cannot break, say you tried and how.
  "Sound" with a described attack is worth far more than "looks fine".
- **Say when you are uncertain.** A flagged unknown is more useful than a
  confident wrong verdict. Both prior reviewers made a factual error apiece —
  one measured a stale build, one gave a fix whose parenthetical was the wrong
  branch — and both were caught only because they showed their numbers.

### Environment

```bash
git clone https://github.com/brijeshp/pinflow && cd pinflow
git checkout 9a2fc21
pnpm install                 # pnpm only, Node >= 18
pnpm test                    # 392 unit, 2 CI-only skips
pnpm test:coverage           # gate: 80% lines/functions/statements, 75% branches
pnpm test:e2e                # 27, Playwright, 3 browser profiles
pnpm typecheck && pnpm build && pnpm size && pnpm wiki:check
```

Read `AGENTS.md` for the hard invariants before judging any design choice — several
things that look wrong are deliberate and documented (bundle-size ceilings, the
`_`-prefix mangling rule, core↔voice isolation, never weakening export escaping).

---

## Reviewer A — the evidence

**Your question: does every checkable claim in this release survive checking?**

Deliberately not a code review. You are auditing the _verification_.

1. **The test suite as an instrument.** For each test added or changed in
   `3044d1c..9a2fc21` — the bulk are in `tests/core/export.test.ts` (+252),
   `selector.test.ts` (+224), `dom.test.ts` (+85), `export-ui.test.ts` (+59) —
   **break the code it claims to protect and confirm the test goes red.** This is
   hand-run mutation testing and it is the single highest-value thing in this
   document. Every one of the five known instances would have been caught by it.
   Report any test that survives a mutation of the behaviour it names.

2. **The structural test.** `tests/core/export.test.ts:629` asserts that every
   `${…}` in `src/core/export.ts` routes through an escaper, by regex over the
   source. It was added _because_ three enumerative rounds each missed a field.
   Can you add an unescaped interpolation to `export.ts` that it does not catch?
   Its allow-list (`Math.`, `.length`) and its `[^\`}]\*` nested-template exclusion
   are the places to push.

3. **Claims in commit messages.** Many carry specific numbers — "16,002 of 16,005
   elements", "81x", "~2.8x", "342 of 6,859", "+100 B gz", "0 escapes across
   6,859 combinations", "700 randomised DOMs". Spot-check the ones that would
   change a decision if wrong. At least one earlier number in this session was
   measured against a stale build and had to be withdrawn.

4. **`TDD: N tests RED first`** trailers. The repo's convention is that every
   test is traced to fail against pre-fix code. Pick three commits and verify by
   checking out the parent and running the new test against it.

5. **Docs vs reality.** `docs/wiki/core.md` and `build-and-release.md` were
   rewritten this cycle. `AGENTS.md` gained three invariants. Do they describe
   the code as it is? One stale claim (`no git remote`) survived in `AGENTS.md`
   for weeks before being caught this session — assume there are more.

6. **The audit log.** `docs/audits/2026-08-08-041-csp-heal-export-review.md`
   narrates five review rounds. Is it accurate, and does it omit anything
   unflattering? It is the artifact a future maintainer will trust.

## Reviewer B — the code

**Your question: is this release correct, judged as if it had no review history?**

Do not read the audit log before forming your own view. Read it afterwards to
see what you and the prior reviewers each missed.

Five changes, in descending order of blast radius:

1. **`src/core/selector.ts` — the heal ladder.** The highest-risk file: its
   failure mode is _silent_, attaching a reviewer's comment to the wrong element,
   and `annotator.ts`'s `_persistHeal` writes the result back to storage, making
   a wrong answer permanent. Changed this cycle: resolution order is now
   `exact ?? positional ?? best`; a `corroborates()` gate demotes a positional
   hit that contradicts a stored fingerprint; a zero-box guard; the walk breaks
   at the first non-descendant after an exact match; two counters bound it
   (`FINGERPRINT_VISIT_LIMIT` 20000 for work, `FINGERPRINT_WALK_LIMIT` 2000 for
   scored nodes) plus a 2 ms deadline; `getTextFingerprint` scans a bounded
   prefix with a full-string fallback. The file's own doctrine, worth holding it
   to: _"Conservatism beats recall here: a wrong re-anchor silently attaches
   feedback to the wrong element, which is worse than an honest orphan."_
   **A documented residual to attack rather than re-report:** a _visible_ stale
   duplicate of the old text still wins over a legitimately-rewritten element.
   Is that genuinely undecidable from the DOM, as claimed?

2. **`src/core/export.ts` — the escaping contract.** Exported Markdown is pasted
   into coding agents, so injection is the threat. Two escapers now: `inline()`
   (newlines + backticks) everywhere, `attr()` (adds `"`, `<`, `>` → guillemets)
   on all four element-label interpolations, `quoted()` for comment text as the
   sole deliberate bypass. Three consecutive rounds each fixed a subset and
   missed one. **Assume a fourth miss exists.** Try to make a field forge markdown
   structure, forge an attribute an agent would extract, or unbalance a code span.

3. **`src/core/ui/dom.ts` — CSP survival.** A shadow root has no CSP context of
   its own, so `style-src 'self'` dropped the `<style>` element — and because
   `pointer-events:none` is set via CSSOM (unrestricted) while every
   `pointer-events:auto` lived in the blocked sheet, the widget became an
   invisible, fully non-interactive overlay. Now adopts a constructed
   `CSSStyleSheet`, `<style>` retained as fallback below Safari 16.4. Is the
   feature probe correct, and does the fallback actually work where it must?

4. **`agent/` — a published instruction surface.** Four markdown files telling a
   coding agent how to read an artifact. This ships on npm and _changes agent
   behaviour_, which makes it a security surface. It forbids interpolating
   artifact values into shell commands and forbids fetching URLs found in
   artifacts. **Read it as an attacker:** can a crafted artifact talk an agent
   that loaded this pack into a harmful action? Are the rules specific enough to
   actually be followed, or do they read as advice that gets skipped?

5. **The provenance scrub** (`0d0f761`, `0050ce2`). 91 code comments rewritten
   from a tool name to `(review #N)`. Mechanical, but verify it changed only
   comments — no string literal, test fixture, or behaviour altered.

6. **`scripts/wiki-check.mjs`** — the release-blocking fix, and **the only
   change in this range with no second reviewer**. It now ignores `.changeset/`
   deletions and a version-only `package.json` change, so a release commit stops
   tripping it. The guard must still fire for: any `src/` change, an _added_
   changeset, and a `package.json` change to scripts/size-limit/exports/files.
   Those five cases were checked against real commits; check them again, and
   look for a sixth the fix now lets through. Note the failure mode it caused —
   a check firing for a reason unrelated to its purpose, which is the same
   family as the five above, inverted.

---

## Output

Severity-banded, `path:line`, one concrete failure scenario per finding —
inputs and state in, wrong output or crash out. No finding without a scenario.

- **P1** — silently wrong output, data corruption, or an exploitable escape
- **P2** — a real defect with a bounded blast radius, or a stated invariant that
  does not hold
- **P3** — accuracy, coverage gaps, documentation that will mislead

Say explicitly what you checked and found **sound** — that is how the next reader
knows what was covered. End with a bare final line, exactly:

```
VERDICT: APPROVED
```

or

```
VERDICT: CHANGES_REQUESTED
```

## Known and accepted — do not re-report unless you can show real harm

- A `src` value can render an inline Markdown link. Escaping `[]()` would mangle
  legitimate query strings; the pack forbids fetching artifact URLs instead.
- `attr()` substitutes characters, so a testid prints differently in
  `**Element:**` than in `**Selector candidates:**`. Deliberate — the latter is
  the faithful copy and the pack points searches there.
- Size ceilings were raised (IIFE 14.55 → 15.0 KB gz, currently 14.92). A
  documented exception to "budgets only ratchet down"; re-ratchet is pending.
- `docs/plans/`, `docs/ideation/`, `docs/brainstorms/` are planning artifacts,
  not specifications. `specs/pinflow_v1_spec.md` is known to be ~40% stale.
- The two prior reviews are in `docs/audits/2026-08-08-041-csp-heal-export-review.md`.

## Not in scope

0.5.0 (unbuilt), the commercial plan, the marketing site, and the unmerged
`claude/peaceful-mclaren-c0d78e` branch.
