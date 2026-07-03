---
title: 'refactor: Razor-thin bundle — code review remediation + optimization'
type: refactor
status: active
date: 2026-07-03
---

# ♻️ Razor-Thin Bundle: Code Review Remediation + Optimization Plan

## Overview

Full-codebase review (bundle/perf, TypeScript quality, simplicity/YAGNI, repo conventions) of pinflow as of `feat/v2-voice-stealth-foundation` (`8164954`), consolidated into a phased optimization plan. Pinflow ships as a third-party NPM library embedded into host codebases, so the bar is: **razor-thin bundles, zero host-page harm, no API regrets**.

**Measured baseline (2026-07-03):**

| Bundle                     | Raw    | Gzip       | Notes                     |
| -------------------------- | ------ | ---------- | ------------------------- |
| `dist/index.js` (core ESM) | 46,035 | **12,819** | ⚠️ shipped unminified     |
| `dist/pinflow.iife.js`     | 29,510 | **9,909**  | minified                  |
| `dist/react.js`            | 46,266 | **12,917** | ⚠️ duplicates entire core |
| `dist/vue.js`              | 46,738 | **13,049** | ⚠️ duplicates entire core |
| `dist/voice.js`            | 15,448 | **5,075**  | ⚠️ shipped unminified     |

**Projected end state** (build-config wins only, before source slimming): core ESM **~9.0 KB gz**, IIFE **~9.5**, voice **~3.7**, react **~0.33**, vue **~0.47** — with zero behavioral change to the CDN single-file story.

Minified core composition (esbuild metafile): `annotator.ts` 40.9%, `export.ts` 12.2%, `styles.ts` 11.5%, `gesture/controller.ts` 8.1%, `storage.ts` 6.2%, `selector.ts` 6.1%.

## Problem Statement

1. The review found **correctness/privacy bugs in the just-landed v2 code** (live mic leak, silent voice failures, comment resurrection) that must land before any release — cheap to fix now, breaking-expensive to discover in the wild.
2. The two cheapest, highest-leverage size wins (minify ESM output; externalize core from wrappers) are pure build config and cut published bytes by **26–97% per entry**.
3. Size budgets (30/30/14 KB gz) have so much headroom that a 3× regression would pass CI silently.
4. ~110–130 lines of dead/speculative code (unused result types, dead metadata pipeline, unused injectable seams) cost bytes in every host app.

## Settled Decisions — DO NOT RE-LITIGATE

Per [docs/plans/2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md](2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md) and commit `2a9e91a`:

- `splitting: false` stays (no `chunk-*.js` on unpkg/jsdelivr).
- Lazy voice = injected `loadVoice` seam + bare `import('pinflow/voice')` marked `external`. Never a relative dynamic import.
- CSS ships as a hand-minified inline JS string into Shadow DOM (spec §543). No CSS file extraction.
- Zero runtime deps; no telemetry; no entitlement logic (`CONTRIBUTING.md:21-27`).
- "0 bytes for text users" is an invariant, triple-enforced: size-limit + tsup `external` + `tests/voice/bundle-isolation.test.ts` grep assertion.
- v2 plan Phases 3–5 (token security, export polish, a11y/perf/e2e) still land **after** this — they will _add_ code; budgets below leave headroom for them (plan projects core ~10–13 KB, voice ~8.4 KB eventual).

---

## Phase 0 — Correctness & Safety Fixes (BLOCKING — before any release)

Bugs found by review in shipped/branch code. Each fix = failing test first (TDD), then fix.

- [x] **P0.1 Mic left live on partial capture failure** — `src/voice/capture/audio.ts:35-63`: if `audioWorklet.addModule(blob:)` rejects (common under host CSP), the acquired `MediaStream`/`AudioContext` are never released; OS mic indicator stays on for the page's life. Wrap `start()` body in try/catch → run `stop()` logic → rethrow. Defense in depth: add `deps.capture.stop()` in the catch at `src/voice/session.ts:59-69`.
- [x] **P0.2 Detached `fetch` → "Illegal invocation"** — `src/voice/transcription/token.ts:36-37`: `deps.fetchFn ?? fetch` detaches the receiver; Chromium/WebKit throw, failure is swallowed into `degradeToText` → **the documented production voice path silently never works**. Fix: `deps.fetchFn ?? ((i, init) => fetch(i, init))`.
- [x] **P0.3 `init()` throws when storage is blocked** — `src/core/index.ts:38` (`window.localStorage` getter throws SecurityError under third-party-storage blocking) and `src/core/identity.ts:29,38` (unguarded `setItem`). Fall back to an in-memory Storage shim; never crash the host at startup.
- [x] **P0.4 No `ws.onclose` → silent dead recording + leaked keepalive** — `src/voice/transcription/deepgram.ts:61-83`: server-initiated close never clears the 4s keepalive interval and never reaches `onError`, so the session never degrades. Add `onclose` (clear interval; reject if pre-open, else `onError`), an open timeout, and `close()` on the pre-open reject path.
- [x] **P0.5 Debounced save resurrects deleted comments / writes after destroy()** — `src/core/ui/annotator.ts:541-560, 578-581`: the 2s debounce is never cleared on Delete, `closeActiveInput()`, or `destroy()`; a deleted comment gets re-`upsert`ed, and the library writes to localStorage post-teardown. Hold the timer on `activeInput`, clear it in `closeActiveInput()` + delete handler, flush on close (also fixes blur-not-firing-on-removal data loss).
- [x] **P0.6 Voice host callbacks not generation-guarded; degrade lands on wrong route** — `src/core/ui/annotator.ts:442-458`: `commit`/`discard`/`degradeToText` closures ignore the generation counter; a late `degradeToText` after destroy/navigation mutates dead state and stamps the _current_ route instead of the frozen one (violates `voice-contract.ts:20-21`). Capture generation in `buildVoiceHost`; pass frozen `route` into the degrade path.
- [x] **P0.7 Worklet drops fractional downsample ratio** — `src/voice/capture/worklet.ts:22-27`: at 44.1 kHz, `count = 0` reset yields ~14.7 kHz audio declared as 16 kHz — systematic transcription degradation on the most common consumer sample rate. Fix: `this.count -= this.ratio`.

**Success criteria:** all seven have regression tests; existing suite green; grep bundle-isolation test still passes.

## Phase 1 — Build Config Wins (~1 day, −3.4 KB gz core, wrappers −97%)

- [x] **P1.1 Minify ESM/CJS output** — add `minify: true` to the first config in [tsup.config.ts](../../tsup.config.ts). Measured: core 12,819 → **9,432 gz**; voice 5,075 → **3,868 gz**. Sourcemaps already ship. This is what esm.sh users execute and what bundlephobia reports.
- [x] **P1.2 Externalize core from react/vue wrappers** — wrappers import `pinflow` (bare specifier, resolved via own `exports` map) instead of inlining core: react 12,917 → **~330 gz**, vue → **~470 gz**. Does not touch `splitting: false` (no anonymous chunks; wrapper consumers by definition run bundlers). Also **fixes a latent double-singleton bug**: today `pinflow` + `pinflow/react` in one app = two core copies = two independent `current` singletons (`src/core/index.ts:30`). Implementation: third tsup config with `external: ['pinflow']` + alias for `../core/index` → `pinflow`; add vitest alias for tests.
- [x] **P1.3 Mangle private members** — `_`-prefix private class members in `Annotator`, `GestureController`, `TranscriptStore`; set `mangleProps: /^_/` in both configs. Measured: **−~370 gz** core, similar on IIFE. Keep the public API (`init`, `destroy`, `stop`, `dispose`, `commit`) unprefixed; verify `.d.ts` output unchanged.
- [x] **P1.4 `sideEffects: false`** — `package.json:28-30` currently `["**/*.css"]` which matches nothing (styles are a JS string). Make intent explicit.
- [x] **P1.5 Inject real version** — `src/core/index.ts:24` hardcodes `'0.0.0'`; use tsup `define` from package.json.
- [ ] **Skip (measured, not worth it):** `target: es2022` (+3 bytes), dropping console (breaks voice failure observability), trimming export.ts markdown labels (AI-agent output contract), further styles.ts squeezing (~100 gz for real visual cost).

**Success criteria:** `pnpm size` green; `tests/voice/bundle-isolation.test.ts` green (voice symbols still absent from core, `pinflow/voice` literal still present); e2e suite green against minified output.

## Phase 2 — Runtime Performance (scroll-path fixes; ~1–2 days)

The one thing an embedded widget must never do is jank someone else's app.

- [ ] **P2.1 Stop re-reading localStorage per scroll frame** — `src/core/ui/annotator.ts:137-146 → 510-516 → 461-470`: builder mode's `repositionPins()` → `visibleComments()` → `loadAllStores()` does a full key scan + JSON.parse of every reviewer's corpus at up to 60fps. Cache `visibleComments()`; invalidate in `renderPins()`/`refreshRoute()`.
- [ ] **P2.2 Cache anchor resolution across reflow frames** — `annotator.ts:514` + `src/core/selector.ts:92-135`: every pin re-runs the full selector ladder per frame; an **orphaned** pin runs testid→id→CSS→XPath→2000-element TreeWalker (with full-subtree `textContent` reads) every frame — effectively quadratic in host DOM size. Cache `Map<commentId, Element|null>` at render time; on reflow only check `el.isConnected`, re-resolve lazily.
- [ ] **P2.3 Deepgram `finalize()` handshake** — `src/voice/transcription/deepgram.ts:41-46`: blind 300 ms sleep drops the sentence tail on slow links. Resolve on the `from_finalize: true` result; keep the timer as fallback only.
- [ ] **P2.4 Gesture listener early-exit** — `src/core/gesture/controller.ts:52`: permanent capture-phase document `pointermove` in stealth mode; add the 2-line inactive early-return.

**Success criteria:** manual scroll profile with 10 orphaned pins on a 5,000-node DOM shows no `selector.ts` frames; v2 plan's ≤4 ms/frame budget upheld.

## Phase 3 — Source Slimming (~110–130 LOC; ~1 day)

Dead weight identified by simplicity review, cross-confirmed by bundle analysis:

- [ ] **P3.1 Collapse `SaveResult` plumbing** — `src/core/storage.ts:15, 97-129`: the reason taxonomy + read-before-write full-store re-parse exist for a caller (`annotator.ts:148-150`) that discards the result. Simplify to guarded write + **one-time `console.warn` on first failure** (review consensus: don't lose the signal entirely, but don't ship an unread taxonomy). Keep the never-throw property and forward-tolerant `migrate()`. (~25 LOC)
- [ ] **P3.2 Direct `onClick` in a `makeButton` helper; shared `makePanel(title, body, buttons)`** — kills the `dataset.act` delegation plumbing (`annotator.ts:239-244, 283-287, 291-302, 630-633`) and duplicated panel scaffolding (`214-231` vs `616-629`). Add tiny `el(tag, cls?, text?)` + `place(el, pos)` helpers for the 24 createElement sites / 6 px-positioning sites. (~40 LOC and the dominant 41% module shrinks; ~250–350 gz with P1.3)
- [ ] **P3.3 Wire or cut the dead voice-metadata pipeline** — `confidence` is parsed/clamped/threaded (`protocol.ts:38-40,66-70`, `deepgram.ts:78`) then dropped at `session.ts:48`; `VoiceMeta.edited` (`core/types.ts:35`) is never set. **Recommendation: wire both** (2 small changes: persist confidence in `session.ts:71-84`; set `voice.edited = true` in `openInput`'s save when a voice comment's text changes) — they're documented public API the paid compiler will consume. Cutting is the fallback if product says no.
- [ ] **P3.4 Dead code removals** — `clearProject` (`storage.ts:172-177`, zero callers; `handleBuilderClear` reimplements it inline — pick one), `isVoiceComment` export (`core/index.ts:22`, unused), `SessionState`/`currentState` (`voice/transcript-store.ts:15-17`), duplicate noop session (`voice/index.ts:8` vs `session.ts:19-21`), `router.ts:5-7` `current()` duplicating `routeOf()`, unused injectable seams (`AnnotatorDeps.loadVoice` — no test injects it; `GestureController.doc?`; `SessionDeps.store?`). (~32 LOC)
- [ ] **P3.5 export.ts internals** — make `isOrphaned` a required arg (both callers pass it), drop `exportFilename`'s redundant `kind` param, extract the duplicated reviewer-suffix heading ternary. (~13 LOC)
- [ ] **P3.6 Reduced-defensiveness decisions** — quarantine forensics (`storage.ts:69-77`) and `download.ts:23-36` execCommand fallback: keep-or-cut call during implementation; both are marginal bytes, lean cut.

## Phase 4 — Public API Corrections (breaking-cheap now, breaking-expensive after 1.0)

- [ ] **P4.1 `getToken?: () => Promise<string>` escape hatch** on `VoiceConfig` — `tokenEndpoint` is a bare POST with no auth/credentials/project-id path, and `language`/`model` are hardcoded (`protocol.ts:10-11`). One additive field future-proofs all of it. Add **now**, before the shape calcifies.
- [ ] **P4.2 Honor the `devOnlyToken` promise** — `core/types.ts:88-91` documents "throws at init on non-local origin"; reality is a lazy, swallowed warn at first recording (`token.ts:44-52`). Validate eagerly in `init()` — the loud early failure is the whole point of the guardrail. (Aligns with v2 plan Phase 3 token-security work.)
- [ ] **P4.3 Stealth mode defeated by name prompt at load** — `core/index.ts:40-47`: blocking `window.prompt` fires at host startup even in stealth. Defer identity resolution to first activation.
- [ ] **P4.4 Cut unused public config** (flag as breaking, batch into one changeset): `position` (README-documented, zero usage anywhere, ~15 LOC of corner-splitting logic), `hidden` (redundant with `activation: 'stealth'`), `activation.longPressMs` (constant would do). Decide per-option; default lean cut pre-1.0.
- [ ] **P4.5 Wrapper hygiene** — Vue: snapshot reactive props (`init({ ...props })` at `vue/index.ts:15`) instead of retaining the live proxy; reconsider `onSubmit` prop name (collides with Vue `@submit` convention). React: move `propsRef.current = props` out of render phase (`react/index.ts:11`). Both: `console.warn` on double-init of the core singleton; document which props are re-init keys.
- [ ] **P4.6 Misc contract fixes** — `voice-loader.ts:13` interop-shape guard (validate `typeof mod.start === 'function'` → clean rejection into the existing degrade path); `normalizeComments` unsound cast (`storage.ts:50-53` — validate `text`/`route`/anchor sub-shape so corrupt entries can't crash export at `export.ts:61`); `history.pushState` restore only-if-still-ours (`router.ts:38-40`); `doc.createTreeWalker` not global (`selector.ts:126`); selector heuristics rejecting legit ids like `header`/`footer` (`selector.ts:6,10` — require a digit in "looks-hashed": `/^(?=.*\d)[a-z0-9]{6,}$/`, fewer orphans feeds P2.2); body-cursor save/restore (`annotator.ts:314,323`); `createUIRoot` body-wait for ESM `init()` (`ui/dom.ts:14`); `controlEl!` → `| null` with honest guards (`annotator.ts:56`); `interim` flag semantics on dispose (`session.ts:108`).

## Phase 5 — Ratchet the Guardrails

- [ ] **P5.1 Tighten size-limit budgets** (`package.json:116-135`) after Phases 1+3: 30/30/14 → **11 KB IIFE / 10.5 KB core ESM / 4.5 KB voice** gz, then re-ratchet after v2 Phases 3–5 land. Current headroom lets a 3× regression pass CI silently.
- [ ] **P5.2 Extend the grep leak assertion** — keep `bundle-isolation.test.ts` authoritative; add react/vue wrapper checks post-P1.2 (wrappers must NOT contain annotator symbols, MUST contain the bare `pinflow` specifier).
- [ ] **P5.3 Add a size CI comment/metafile diff** (optional): emit esbuild metafile per build so composition regressions are reviewable, not just totals.

---

## System-Wide Impact

- **Interaction graph:** P1.2 changes module identity — wrapper + direct `init()` now share one singleton (intended fix). P1.3 mangling must not touch anything crossing the voice contract boundary (`VoiceHost`/`VoiceSession` members are public contract — do not `_`-prefix).
- **Error propagation:** P0.3/P0.4 convert crash/silence into degrade paths; the voice failure ladder (warn → degradeToText) stays intact and observable.
- **State lifecycle:** P0.5/P0.6 close the two paths that mutate storage after teardown. After these, "zero writes after destroy()" is testable — add that assertion.
- **API parity:** P1.2 must ship react/vue/core in lockstep versions (wrapper now resolves `pinflow` at runtime — document the matching-version requirement, or use a `peerDependencies` self-reference note).
- **Integration tests that unit tests won't catch:** (1) e2e against minified IIFE + minified ESM demo page; (2) app importing both `pinflow` and `pinflow/react` sees ONE control; (3) CSP page blocking `blob:` workers → voice degrades, mic indicator OFF; (4) delete-within-2s-of-typing → comment stays deleted after 3s; (5) SPA route change mid-recording → transcript lands on frozen route.

## Acceptance Criteria

- [ ] All Phase 0 fixes landed with regression tests; coverage ≥80% on `src/core/**` maintained
- [ ] `pnpm size` green under new budgets: IIFE ≤11 KB, core ESM ≤10.5 KB, voice ≤4.5 KB (gz)
- [ ] react/vue entries ≤1 KB gz each; single-singleton behavior verified
- [ ] Bundle-isolation grep test extended and green; `pinflow/voice` stays a bare external specifier
- [ ] No localStorage reads on the scroll path; no selector-ladder work for cached/orphaned pins on reflow
- [ ] Zero mic/AudioContext/WebSocket/interval leaks after stop/navigate/destroy (existing + new tests)
- [ ] Breaking API changes (P4.4) batched in one changeset with README updates

## Dependencies & Risks

- **P1.2 (externalize wrappers)** is the riskiest change: needs the alias plumbing, vitest alias, lockstep-version note, and e2e proof. Do it in its own PR.
- **P1.3 (mangleProps)** can silently break anything reflectively accessed; mitigate with the `_`-prefix-only convention + full e2e run.
- **Sequencing vs v2 plan:** Phase 0 now (bugs live on this branch); Phases 1/5 anytime; Phase 3/4 ideally before v2 Phase 4 (export changes touch the same files). v2 Phases 3–5 will re-grow bundles — budgets account for it.
- `docs/solutions/` doesn't exist yet; per the v2 plan, seed it with the bundling-constraints learning after this lands.

## Sources & References

- Related plan: [docs/plans/2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md](2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md) (settled bundling decisions, budgets, remaining phases)
- Constraints: [CONTRIBUTING.md:21-27](../../CONTRIBUTING.md), [specs/pinflow_v1_spec.md](../../specs/pinflow_v1_spec.md) §487/§507/§543
- Prior art: commit `2a9e91a` (first bundle-tidy pass — hand-minified CSS, dead-code cuts, wrapper import decision)
- Load-bearing config: [tsup.config.ts](../../tsup.config.ts), [package.json](../../package.json) (`exports`, size-limit), [tests/voice/bundle-isolation.test.ts](../../tests/voice/bundle-isolation.test.ts)
- Review method: 4 parallel specialist agents (bundle/perf with esbuild-metafile measurements, TypeScript quality, simplicity/YAGNI, repo research) + institutional-learnings sweep, 2026-07-03. All byte figures measured, not estimated (repo ratios: source→gz ~4.4:1, CSS-in-JS ~2.8:1).
