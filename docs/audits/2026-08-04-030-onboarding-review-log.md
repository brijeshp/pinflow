# 0.3.0 onboarding release — review rounds

## Round 1 — Codex (external), CHANGES_REQUESTED

Transcript: `2026-08-04-030-onboarding-codex-r1.md` (consolidated report; an
earlier same-session draft listed two additional items — hydration-erases-
healed-selectors and stale-visibleCache — the first retested-not-reproduced
and locked as a regression test, the second fixed).
Findings: 1 P1 (clear-vs-pending-hydration resurrection incl. reconcile
re-add), 5 P2 (fuzzy bias-before-threshold + tiny fingerprints;
container/leaf ties + heal cementing incl. the <html>/empty-css root cause;
IIFE toggle opt-out; late-orphan accounting + stale sheet title; armed-mode
leaks from confirm flows), 1 P3 (stale JSDoc default).
Remediated in `8509b36` + `78aae5b`.

## Round 2 — independent review agent (Codex unavailable), CHANGES_REQUESTED

Substitution note: Codex CLI wedged reproducibly this night (five stalls
across eight runs, including three consecutive 39-byte-stream freezes); the
verification round ran instead on a fresh-context independent review agent
with the identical per-finding adversarial brief. Codex may re-certify
post-merge; any findings become follow-up patches.
Outcome: six of seven findings RESOLVED; one NEW P2 (sheet-summon over an
armed menu left annotate mode armed — reproduced); one mechanism correction
(mergeComments ties are SERVER-wins; healed selectors survive via the
post-merge render re-heal, not a tie-break — round-1 commit message was
wrong and the test comment now states the real mechanism); P3 notes
(fingerprint walk full-scan tradeoff now changeset-documented; coverage
gaps closed).
Remediated in `e62c72b`.

## Round 3 — final verification

See `2026-08-04-030-onboarding-r3-verdict.md`.
