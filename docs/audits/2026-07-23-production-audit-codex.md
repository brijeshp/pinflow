## Production Readiness Certification

**Scope:** Full repository at `chore/production-audit`, head `f6b98f4bd1373e25cbbe9bd8d7e4a4eb1e2bbdf0`.

**Mode:** Report-only. Existing `.claude/launch.json` modification was not touched.

**Method:** Full static sweep plus independent correctness, lifecycle, security, API, testing, and project-standards passes. Fifteen P1 candidates received a separate validation pass; fourteen validated at P1 and the storage-key collision was recalibrated to P2.

### P1 - High

- **#1 [package.json:119](/Users/brijeshpatel/Apps/pinflow/package.json:119) - Size ceilings were raised to fit the audit changes.** Head increases IIFE and ESM budgets by 50 bytes, directly violating "budgets only ever ratchet down." Restore the previous ceilings and reduce the bundles.

- **#2 [export.ts:57](/Users/brijeshpatel/Apps/pinflow/src/core/export.ts:57) - Markdown prompt-injection protection is incomplete.** Only `comment.text` is blockquoted. URL-controlled reviewer names and source/localStorage-controlled IDs, routes, resolution, selectors, context, styles, project, and `describeRoute` output can create top-level instructions. Bare `\r` also bypasses the text regex. Contextually escape every interpolated field and test all newline forms.

- **#3 [annotator.ts:167](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:167) - SPA navigation permanently drops source hydration.** `refreshRoute()` changes the generation, causing the one source response to be discarded without retry. A slow initial fetch followed by navigation leaves server comments missing until re-init. The current test explicitly blesses this loss.

- **#4 [annotator.ts:664](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:664) - Voice startup cannot be cancelled.** Destroying or navigating while token acquisition, WebSocket open, or microphone permission is pending can still open a socket or prompt for the mic in a torn-down instance. Thread an `AbortSignal` through startup and check it before each side effect.

- **#5 [session.ts:96](/Users/brijeshpatel/Apps/pinflow/src/voice/session.ts:96) - Concurrent stop and destroy can lose a transcript.** `stop()` marks the session settled before awaiting finalization; `dispose()` then skips salvage, and the eventual commit may be rejected after destruction. Model finalizing and persisted state separately and guarantee exactly-once salvage.

- **#6 [annotator.ts:136](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:136) - Pins detach inside nested scroll containers.** Only `window` scroll is observed, while element scroll events do not bubble. Pins retain stale fixed coordinates when an overflow container moves their targets. Observe captured document scroll or relevant ancestors.

- **#7 [annotator.ts:843](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:843) - Hydration can edit a newly resolved comment.** The editor captures `frozen` once. If hydration marks that comment done or declined while it is open, Save still overwrites text and emits an update. Re-check current disposition at save or close the editor on hydration.

- **#8 [safe-storage.ts:27](/Users/brijeshpatel/Apps/pinflow/src/core/safe-storage.ts:27) - Write-denied localStorage loses feedback.** A readable store whose `setItem` fails only produces a warning; data is not redirected to the memory shim. Re-init loses the comment. Implement write-capable fallback semantics or explicitly surface persistence failure.

- **#9 [react/index.ts:21](/Users/brijeshpatel/Apps/pinflow/src/react/index.ts:21) - React retains stale configuration.** Rerenders do not update `onChange`, `onSubmit`, `source`, theme, route helpers, `submitTo`, or token providers. Normal callback closure updates silently use old state or credentials. Define and test update semantics for every public prop.

- **#10 [annotator.ts:291](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:291) - Async host callback failures escape containment.** `try/catch` cannot catch a rejected async `onChange`; `onSubmit` is also fired without rejection handling. A failed sync request becomes an unhandled rejection despite the documented exception guarantee.

- **#11 [ci.yml:27](/Users/brijeshpatel/Apps/pinflow/.github/workflows/ci.yml:27) - CI and publishing never run the coverage gate.** Both use `pnpm test`, while thresholds are evaluated only by `pnpm test:coverage`. Coverage can fall below the hard invariant while every required check passes.

- **#12 [bundle-isolation.test.ts:13](/Users/brijeshpatel/Apps/pinflow/tests/voice/bundle-isolation.test.ts:13) - Bundle-isolation checks silently skip.** CI tests before building, so clean checkouts have no `dist`; both voice and wrapper isolation suites pass as skipped. CI builds afterward and never reruns them. Build first and fail if expected artifacts are absent.

- **#13 [release.yml:3](/Users/brijeshpatel/Apps/pinflow/.github/workflows/release.yml:3) - Release is not gated on CI success.** The release workflow triggers independently on a main push and can publish the version commit before verify/E2E complete. Make publishing depend on successful checks for the exact SHA.

- **#14 [annotator.ts:485](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:485) - Builder mode is materially nonfunctional.** Reviewer checkboxes have no listeners, and pin clicks return immediately at line 791. Builders cannot filter, read, or delete individual comments, contrary to the product spec. This disproves the internal audit's "harmless inert" rationale.

- **#15 [webhook-discord/index.html:47](/Users/brijeshpatel/Apps/pinflow/examples/webhook-discord/index.html:47) - Slack and Discord examples expose reusable webhook credentials.** Following the official examples puts the secret-bearing URL in browser-delivered HTML. Replace both with authenticated, bounded server-side proxies.

- **#16 [feedback.ts:19](/Users/brijeshpatel/Apps/pinflow/examples/webhook-vercel-notion/api/feedback.ts:19) - The deployable Notion endpoint is unauthenticated and unbounded.** Anyone can submit an arbitrary number of comments, causing privileged Notion writes and cost/resource amplification. Add authentication, schema and size limits, rate limiting, and upstream error handling.

- **#17 [deepgram.ts:99](/Users/brijeshpatel/Apps/pinflow/src/voice/transcription/deepgram.ts:99) - Unexpected provider disconnect leaves a dead recording active.** Post-open WebSocket errors only log; capture and the microphone continue while PCM is discarded until the user manually stops. Transition the session to a terminal salvage/degrade state.

### P2 - Moderate

- **#18 [annotator.ts:171](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:171) - The `source` boundary is not contained or validated.** A synchronous throw escapes construction after UI/listeners are installed; a resolved non-array throws in the fulfillment callback; malformed comments enter merge/render. Normalize the promise and validate the payload.

- **#19 [storage.ts:16](/Users/brijeshpatel/Apps/pinflow/src/core/storage.ts:16) - Storage namespaces collide on colons.** `project="a", reviewer="b:c"` and `project="a:b", reviewer="c"` produce the same key. Builder enumeration can disclose or clear another project's comments. Encode or length-prefix components and validate the embedded scope.

- **#20 [storage.ts:43](/Users/brijeshpatel/Apps/pinflow/src/core/storage.ts:43) - Nested localStorage data is only shallowly validated.** Missing or nonfinite coordinates and viewport fields survive normalization, yielding `NaN%` positions and malformed exports. Validate all nested types, bounds, and optional context/voice shapes.

- **#21 [worklet.ts:14](/Users/brijeshpatel/Apps/pinflow/src/voice/capture/worklet.ts:14) - Audio is truncated and attenuated.** Production stop never flushes the partial 2048-sample buffer, so short recordings may send no PCM. At 44.1 kHz, fractional `count` is retained while `acc` is reset, reducing a constant 0.5 signal to a measured mean of about 0.422. Implement a proper resampler and stop/flush handshake.

- **#22 [annotator.ts:821](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:821) - Initially orphaned pins never recover on reflow.** A cached `null` is permanent, so an asynchronously mounted target remains orphaned through resize and scrolling. Add bounded re-resolution or DOM-change invalidation.

- **#23 [annotator.ts:1072](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:1072) - Delayed clipboard completion can replace newer UI.** A late clipboard promise unconditionally closes the current panel and shows stale confirmation after the user closes or replaces the export surface. Guard by operation generation and panel ownership.

- **#24 [core/index.ts:7](/Users/brijeshpatel/Apps/pinflow/src/core/index.ts:7) - `PinflowTheme` is missing from root type exports.** It is a named public configuration type but consumers cannot import it from `pinflow`. Export it and add a packed-package type-consumer test.

- **#25 [api.md:17](/Users/brijeshpatel/Apps/pinflow/docs/wiki/api.md:17) - Public API documentation contradicts runtime behavior.** `routeOf` does not strip reviewer/mode parameters; `onSubmit` runs from a separate button rather than "Export & share"; `positionPercent` is 0..100, not 0..1. Pick canonical behavior and lock it with contract tests.

- **#26 [webhook-slack/index.html:47](/Users/brijeshpatel/Apps/pinflow/examples/webhook-slack/index.html:47) - All three webhook examples initialize twice.** `data-project` auto-initializes the IIFE, then the inline script calls `Pinflow.init`, replacing the first instance and warning. Remove `data-project` from manually configured installs.

- **#27 [annotator.ts:775](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:775) - The audit's user-facing changes have no changeset.** Keyboard pins, reduced motion, and font behavior changed without the required patch changeset.

- **#28 [vitest.config.ts:27](/Users/brijeshpatel/Apps/pinflow/vitest.config.ts:27) - The advertised core coverage excludes the primary state machine.** All of `src/core/ui/**` is excluded, including the roughly 1,100-line Annotator. Reporting 96.8% as coverage of `src/core/**` is materially misleading.

- **#29 [production-audit.md:12](/Users/brijeshpatel/Apps/pinflow/docs/audits/2026-07-23-production-audit.md:12) - The internal audit falsely reports `wiki:check` clean.** Running the checker at this head fails for `package.json`, `annotator.ts`, and `styles.ts`; the wiki still contains old budgets. Follow the prescribed wiki update and add the check to CI.

- **#30 [README.md:13](/Users/brijeshpatel/Apps/pinflow/README.md:13) - OSS launch documentation is visibly stale.** The lead demo image is missing, README calls an obsolete spec the full API, the demo advertises approximately 7 KB and a 30 KB ceiling, its export omits IDs, and CONTRIBUTING lists another obsolete budget set. Refresh public artifacts from current sources.

- **#31 [CONTRIBUTING.md:29](/Users/brijeshpatel/Apps/pinflow/CONTRIBUTING.md:29) - The private security-reporting path does not exist.** Contributors are told to email the maintainer in `package.json`, but no maintainer email is present and there is no `SECURITY.md`. Provide a real private contact.

### P3 - Low

- **#32 [annotator.ts:661](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:661) - Voice comments can combine route A with URL B.** Route is frozen when recording begins, but `fullUrl` is read at commit. Navigation during finalization creates inconsistent metadata. Freeze both together.

- **#33 [wiki-check.mjs:11](/Users/brijeshpatel/Apps/pinflow/scripts/wiki-check.mjs:11) - The wiki drift detector omits governed surfaces.** Workflow, changeset, and test-layout changes can alter build/release/testing behavior while `wiki:check` reports clean. Align watched paths with the wiki update playbook.

- **#34 [production-audit.md:44](/Users/brijeshpatel/Apps/pinflow/docs/audits/2026-07-23-production-audit.md:44) - The internal audit cites an absent external certification.** `docs/audits/2026-07-23-production-audit-codex.md` does not exist at the audited head.

### Verified Sound

- **Clean/minimal:** Typecheck and formatting pass. There are zero runtime dependencies; React and Vue are optional peers. No telemetry, `console.log`, TODO/FIXME, `innerHTML`, `eval`, or `document.write` exists in shipped source.
- **Security:** Shipped DOM text is created with `textContent`/`value`; the reviewed runtime XSS surface is sound outside the Markdown issue. Production token safeguards reject `devOnlyToken` off local origins; tokens are not persisted, logged, or placed in URLs.
- **Build/isolation:** tsup externalizes `pinflow/voice`, wrapper bundles retain bare `pinflow` imports, `_` mangling is consistently configured, and manual inspection of existing artifacts found no voice implementation in core. Existing bundles fit the current declared ceilings, although #1 makes those ceilings noncompliant.
- **Functional:** SSR returns a complete inert handle. Router teardown, selector fallback, gesture cancellation, ordinary explicit-save behavior, immutable merges, and completed-session voice cleanup are well covered and locally coherent.
- **Scalable/extensible:** Reflow is rAF-throttled, selector fingerprint search is capped, builder storage scans are cached, the core/voice seam is typed, artifact helpers are exported, and the package export map/files allowlist are coherent.
- **Testing/release:** Playwright is configured for Chromium, mobile Chrome, and genuine WebKit-backed iPhone emulation. Frozen installs, formatting, typecheck, build, size, and E2E jobs exist; findings #11-#13 concern missing enforcement and ordering.

### Coverage and Certification Limits

The installed test stack could not execute in this read-only sandbox because pnpm/Vitest failed during protected temporary/keychain operations; size-limit likewise could not create its temporary build directories. Therefore the internal 274-unit/27-E2E counts were not independently rerun. Direct TypeScript and Prettier checks passed; `wiki:check` independently failed. Existing artifact sizes and isolation were manually checked.

The requested cross-model reviewer could not create its scratch artifacts in this read-only environment. The review instead used independent persona passes and a separate 15-finding validation batch; all P1 candidates validated except #19, which was retained at P2.

The known exclusions were respected: no Vue parity finding beyond `exportUi`, no npm remote/publish-decision finding, no IIFE voice-degradation finding, and no annotator-size finding.

### Actionable Findings

- **Release integrity:** Fix #1, #11, #12, #13, #27, #28, #29, #33, and #34 before treating any green run as certification evidence.
- **Security and data trust:** Fix #2, #8, #15, #16, #19, #20, and #31 before publishing examples or agent-facing exports.
- **Lifecycle/correctness:** Fix #3-#7, #17, #18, #21-#23, and #32, then add race-focused unit and browser tests.
- **API/product coherence:** Fix #9, #10, #14, #24-#26, and #30, then validate the packed package and all official examples.

---

### Verdict

Not production-ready for open-sourcing. The first required work is to restore the size ratchet, close the Markdown injection surface, correct the hydration/voice lifecycle races, and make CI actually enforce the invariants it claims to enforce. Approval requires all findings, including documentation and audit-evidence defects, to reach zero.

VERDICT: CHANGES_REQUESTED
