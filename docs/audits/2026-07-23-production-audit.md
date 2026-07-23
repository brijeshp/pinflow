# Production readiness audit — 2026-07-23

Scope: full repo at `main` (`61a66ec`) + this branch's fixes. Method: mechanical gates, dimension-by-dimension manual passes, live browser probes, and three rounds of external Codex certification (verbatim transcripts alongside this file).

## Gate results (at audit head, post-remediation)

| Gate                                           | Result                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                                           | 301 passed (+2 CI-only guards, skipped locally)                                                                                                                                                                           |
| E2E (chromium / mobile-chrome / mobile-safari) | 27 passed                                                                                                                                                                                                                 |
| Packed type surface                            | consumer program compiles against `dist/index.d.ts` with zero diagnostics                                                                                                                                                 |
| Coverage                                       | 94.0% lines / 91.9% branches with the UI layer INCLUDED (annotator ~90%); the first draft cited 96.8% while excluding `src/core/ui/**` — corrected per certification finding #28                                          |
| Typecheck / format                             | clean; wiki re-synced as the final step of every batch (an interim draft claimed clean while drifted — finding #29)                                                                                                       |
| Size budgets                                   | green — audited ceilings core ESM 13 KB, IIFE 13.3, voice 4.45, react 0.47, vue 0.6 (gz); the raise over pre-audit ceilings is the measured cost of the certification fixes, documented in the production-audit changeset |
| Runtime dependencies                           | **zero** (invariant holds); peers react/vue only                                                                                                                                                                          |

## What this audit changed

The audit ran in two layers. The internal pass landed four fixes (hostile-input lock for the export-escaping invariant; pins as real buttons with accessible names; `prefers-reduced-motion`; font-stack hardening). External certification then drove three more remediation waves — 35 findings total, every one resolved with a dedicated regression test where behavior changed:

- **Security**: escaping extended from comment text to EVERY interpolated export field (incl. bare `\r` and code-span integrity); webhook examples restructured so credentials live server-side behind required tokens or an honest origin gate; SECURITY.md private reporting path.
- **Lifecycle**: hydration survives SPA navigation; abort reaches the token fetch and precedes socket/mic acquisition; transcripts persist exactly once across stop/dispose/destroy (storage-only after teardown); provider errors mid-recording salvage and release the mic; worklet flushes partial buffers and no longer attenuates amplitude; nested-scroll repositioning; bounded orphan healing; strict late-clipboard ownership; frozen route+URL pairing on every voice path.
- **Data trust**: write-probe storage acquisition with a singleton memory shim; URI-encoded storage keys with scope-verified legacy fallback; deep anchor/context/voice validation at their real locations.
- **API/product**: builder mode made functional (filtering + read-only views); React wrapper delegates function-prop identity and re-inits on presence; `PinflowTheme` exported; `routeOf` unified with the documented stripping; `exportUi` chord left to the host when inert.
- **Enforcement**: CI builds before testing, runs the coverage-gated suite and `wiki:check`; bundle-isolation hard-fails in CI; `prepublishOnly` and the release workflow run the full battery including E2E and `wiki:check` on the exact SHA.

## Accepted deviations (documented, not defects)

- **`ui/annotator.ts` (~1.3k lines)** exceeds the 800-line guideline. It is one cohesive interaction state machine whose private members share the `_`-mangling contract; splitting the class across files would trade real coupling risk for a line-count number. Revisit only if a natural seam appears.
- **Builder mode has no per-comment delete** — it is a read-only aggregate (wiki-documented; certification accepted this against v1 spec §5.5 under the repo's precedence rules). `Clear all` remains the only destructive builder action.

## Known open items (tracked elsewhere)

- **Vue wrapper config parity** (`theme`/`source`/`onChange`/`routeKey`/`describeRoute`/`submitTo` not forwarded) — fix in flight in a separate session (task_5e76ee16). `exportUi` already fixed.
- **npm publish + git remote** — deliberate product decision pending (L3.1); release workflow, changesets, `files` allowlist, `.npmignore`, provenance are staged and audited.
- CDN/IIFE voice loading is documented as text-degrading (no resolver on that path) — by design for v1.

## Dimension notes

- **Clean**: no `console.log`, no TODO/FIXME, no `innerHTML`/`eval`, prettier-enforced; examples reference only current APIs and safe credential patterns.
- **Functional**: all gates + live browser passes (demo, both activation modes, every export surface, builder filtering).
- **Minimal**: zero deps; hand-minified stylesheet (worklet template kept comment-free — it ships verbatim); budgets razor-thin over audited actuals.
- **Scalable**: reflow path is rAF-throttled translation-only with anchor caches and bounded orphan retry; selector fingerprint walk capped at 2000 elements; storage writes guarded end to end.
- **Extensible**: core↔voice isolation enforced by build config + CI-hard bundle-isolation test; typed, abortable voice contract; sync protocol documented (PROTOCOL.md); artifact toolkit exported for host-side rendering; changesets govern releases.
- **Maintainable**: agent-maintained wiki with a drift gate that watches src, configs, workflows, changesets, and tests; 301 tests mirroring src layout; conventions enforced in CI.
- **Production-ready**: all-fields untrusted-input escaping locked; shadow-DOM isolation; SSR-safe init; no secrets; a11y pass (buttons, labels, reduced motion, 16px touch inputs); dark mode; LICENSE, SECURITY.md, and publish protections in place.

## Codex certification trail

- **Round 1** (`2026-07-23-production-audit-codex.md`): CHANGES_REQUESTED — 34 findings (17 P1), including three defects in this audit's own first draft.
- **Round 2** (`2026-07-23-production-audit-codex-r2.md`): 17 confirmed resolved; 17 judged incomplete at the edges plus one new finding (#35: this report's own self-consistency).
- **Round 3** (`2026-07-23-production-audit-codex-r3.md`): all but four closed — a misplaced validation check, a missing release-gate step, this report's stale table, and an undocumented example env var. Fixed in the final remediation commit.
- **Round 4** (`2026-07-23-production-audit-codex-r4.md`): final verdict.
