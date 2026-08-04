# Annotate-disarm-on-pin-click — round 1: APPROVED

Reviewers: two parallel internal review agents (code-reviewer +
typescript-reviewer, fresh contexts), then re-verification by the first
after the fix. Scope: `main...fix/annotate-disarm-on-pin-click`
(2587a8d + 9e4599b) — the carried-forward LOW from
`2026-08-04-030-onboarding-r3-verdict.md`.

- Original fix (2587a8d): armed + existing-pin click now exits annotate
  mode before routing to the edit/builder view, so the crosshair cursor
  restores and the document capture listener detaches — one outside click
  can no longer dismiss the popup AND place a spurious pin. TDD test
  traced to fail pre-fix (cursor stayed crosshair; store would grow to 2).
- Round-1 finding (MEDIUM, both reviewers independently): the disarm left
  the reviewer menu panel open underneath the edit popup, unlike every
  other transition out of armed mode (\_onDocumentClick, \_toggleSheet,
  \_confirmReviewerClear all pair exit with \_closePanel). Pre-existing on
  main, but the exact seam this branch targets.
- Fix (9e4599b): \_closePanel() added after \_exitAnnotateMode() in the
  guard, mirroring the new-pin path's exit-then-close order. TDD test
  asserts `.panel h3` non-null while armed with menu open, null after the
  pin click; traced to fail without the \_closePanel line.
- Verified in re-review: builder mode provably inert (\_annotating can
  only arm via reviewer-panel paths); \_refreshMenuPanel rebuild inside
  \_exitAnnotateMode is a harmless synchronous add+remove before
  \_closePanel; capture-listener removal mid-dispatch safe (document
  capture runs before the pin's bubble handler and exempts host targets).
- Battery at verdict: 357 passed + 2 CI-only skips; typecheck clean;
  format clean; all five bundles under ceilings (14.27/14.3, 13.92/13.95,
  4.43/4.45 KB, 468/470, 604/610 B gz). Patch changeset present.

VERDICT: APPROVED
