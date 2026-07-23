## Round 2 certification

I cannot certify this tree. Seventeen of the 34 Round 1 findings are fully resolved; seventeen remain partially or materially unresolved. I also found one newly introduced audit-evidence defect.

### Round 1 resolution ledger

|   # | Status   | Verification                                                                                                                                                                                                 |
| --: | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Resolved | Budget increases are explicit, tied to measured correctness work, documented in the production-audit changeset, and re-ratcheted. This satisfies the repository’s established documented-notch mechanism.    |
|   2 | Resolved | All interpolated Markdown fields use contextual escaping, including bare CR handling, with hostile-field tests.                                                                                              |
|   3 | Resolved | Hydration is guarded by destruction and reviewer identity rather than route generation.                                                                                                                      |
|   4 | **Open** | AbortSignal exists, but token fetch and WebSocket creation remain non-abortable and happen before the first abort check.                                                                                     |
|   5 | **Open** | The session has three phases, but destroy during asynchronous finalization still loses the later commit.                                                                                                     |
|   6 | Resolved | Capture-phase document scroll observes nested scrolling and is removed on teardown.                                                                                                                          |
|   7 | Resolved | Save re-reads the persisted record and rejects edits to newly resolved comments.                                                                                                                             |
|   8 | **Open** | The write probe selects fallback storage, but every acquisition constructs a new Map, so re-init still loses the session corpus.                                                                             |
|   9 | **Open** | Existing function props receive fresh closures, but functions added or removed after mount do not follow the documented latest-render semantics.                                                             |
|  10 | Resolved | Promise rejections from `onChange` and `onSubmit` are contained and logged.                                                                                                                                  |
|  11 | **Open** | CI enforces coverage, but the package publishing hook still runs ordinary tests rather than the coverage gate.                                                                                               |
|  12 | Resolved | CI builds before tests and bundle-isolation tests hard-fail when CI artifacts are absent.                                                                                                                    |
|  13 | **Open** | Release reruns several checks but neither runs E2E nor waits for the CI E2E job.                                                                                                                             |
|  14 | Resolved | Filtering and read-only comment inspection work. I accept deletion being excluded: although v1 spec §5.5 mentions deleting pins, the higher-precedence wiki defines builder aggregation as read-only.        |
|  15 | **Open** | Webhook credentials moved server-side, but the proxies are unauthenticated by default; enabling their optional token breaks the shipped clients. Both READMEs still instruct embedding webhook URLs in HTML. |
|  16 | **Open** | The Notion token is embedded in public HTML, so it provides no authentication. Validation and upstream containment also remain incomplete.                                                                   |
|  17 | **Open** | Provider-error salvage has a startup race that can throw before `persist` is initialized and can leave a late-acquired microphone running.                                                                   |
|  18 | Resolved | Synchronous throws, rejections, non-arrays, and malformed source comments are contained and normalized.                                                                                                      |
|  19 | **Open** | Encoded keys prevent new collisions, but the legacy fallback does not verify the embedded project/reviewer before returning the store.                                                                       |
|  20 | **Open** | Validation covers finite coordinates and viewport numbers only, not bounds, positive dimensions, selector/context/voice shapes, or remaining metadata.                                                       |
|  21 | Resolved | Worklet partial-buffer flush and fractional resampling amplitude are implemented and tested.                                                                                                                 |
|  22 | Resolved | Orphan resolution retries are bounded.                                                                                                                                                                       |
|  23 | **Open** | Replacing the panel is guarded, but closing it sets `_panelEl` to null and still permits the delayed confirmation to reopen.                                                                                 |
|  24 | **Open** | `PinflowTheme` is exported, but the required packed-package type-consumer test is absent.                                                                                                                    |
|  25 | **Open** | `routeOf` is unified and tested and position units are corrected, but the API wiki still falsely says `onSubmit` fires from “Export & share.”                                                                |
|  26 | Resolved | All three examples removed double initialization.                                                                                                                                                            |
|  27 | Resolved | The production-audit patch changeset documents the user-facing changes and measured budget adjustment.                                                                                                       |
|  28 | Resolved | `src/core/ui/**` is included. Cached LCOV corroborates 93.78% lines and 91.62% branches.                                                                                                                     |
|  29 | **Open** | The drift check passes and runs in CI, but the synchronized wiki contains material false claims about escaping and voice abort guarantees.                                                                   |
|  30 | Resolved | README, CONTRIBUTING, demo metadata, API references, and size messaging were refreshed.                                                                                                                      |
|  31 | Resolved | `SECURITY.md` supplies a private reporting path.                                                                                                                                                             |
|  32 | **Open** | Normal voice commits freeze `fullUrl`, but voice degradation calls `_commitTextComment`, which reads the current URL.                                                                                        |
|  33 | **Open** | Workflows and tests are watched, but only `.changeset/config.json` is watched rather than the playbook’s entire `.changeset/` surface.                                                                       |
|  34 | Resolved | The Round 1 transcript is committed.                                                                                                                                                                         |

### Blocking findings

- **#4:** [`resolveToken()`](/Users/brijeshpatel/Apps/pinflow/src/voice/transcription/token.ts:32) accepts no signal, its fetch has no `signal`, and [`start()`](/Users/brijeshpatel/Apps/pinflow/src/voice/index.ts:8) creates the dot/provider without checking abort. [`startSession()`](/Users/brijeshpatel/Apps/pinflow/src/voice/session.ts:48) calls `provider.open()` before its first check. The new test actually expects an already-aborted host to open and then close a stream.

- **#5:** [`destroy()`](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:224) calls synchronous `dispose()` and then marks the annotator destroyed. A concurrent [`stop()`](/Users/brijeshpatel/Apps/pinflow/src/voice/session.ts:128) commits only after awaiting capture/finalization, at which point the host’s destroyed guard rejects that commit. The unit fake does not model this core-session integration.

- **#8:** [`memoryStorage()`](/Users/brijeshpatel/Apps/pinflow/src/core/safe-storage.ts:8) creates a fresh Map on every call, and [`acquireStorage()`](/Users/brijeshpatel/Apps/pinflow/src/core/safe-storage.ts:27) returns a new shim after every failed probe. The exact Round 1 re-init data-loss case remains.

- **#9:** [`Annotator`](/Users/brijeshpatel/Apps/pinflow/src/react/index.ts:28) only installs delegates for functions present on initial mount. Later additions are ignored; removals of `source`, `routeKey`, and `describeRoute` fall back to the initial function. Tests cover present-to-present `onChange` replacement only.

- **#11/#13:** [`prepublishOnly`](/Users/brijeshpatel/Apps/pinflow/package.json:77) omits `test:coverage`. The [`release` workflow](/Users/brijeshpatel/Apps/pinflow/.github/workflows/release.yml:28) omits E2E and does not depend on the exact-SHA CI result.

- **#15/#16:** Slack and Discord make `FEEDBACK_TOKEN` optional while their clients send none; their READMEs still instruct users to place webhook URLs in HTML. The Notion example ships its supposed secret as [`CHANGE-ME` in public HTML](/Users/brijeshpatel/Apps/pinflow/examples/webhook-vercel-notion/public/index.html:56), which cannot authenticate a privileged endpoint. Its handler also dereferences an unvalidated anchor and does not catch rejected upstream requests.

- **#17:** [`onError`](/Users/brijeshpatel/Apps/pinflow/src/voice/session.ts:62) can run while `capture.start()` is pending, before [`persist` is initialized](/Users/brijeshpatel/Apps/pinflow/src/voice/session.ts:111). `capture.stop()` can then run before `getUserMedia` resolves; the late stream subsequently starts in an already-settled session.

- **#19/#20:** [`loadStore()`](/Users/brijeshpatel/Apps/pinflow/src/core/storage.ts:121) returns a legacy-key store without checking its project/reviewer against the requested scope. [`hasValidAnchor()`](/Users/brijeshpatel/Apps/pinflow/src/core/storage.ts:56) implements only part of the requested deep validation.

- **#23:** [`_handleReviewerExport()`](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:1177) explicitly allows confirmation when `_panelEl === null`, so closing the initiating panel does not invalidate the delayed clipboard operation.

- **#24/#25:** The exported type works, but no packed consumer test exists. [`api.md`](/Users/brijeshpatel/Apps/pinflow/docs/wiki/api.md:39) still assigns `onSubmit` to the wrong control.

- **#29/#32/#33:** The wiki falsely says comment text is the only untrusted export field and that abort is checked at every voice side-effect boundary. The degrade path loses frozen `fullUrl` at [`_commitTextComment()`](/Users/brijeshpatel/Apps/pinflow/src/core/ui/annotator.ts:653). [`wiki-check.mjs`](/Users/brijeshpatel/Apps/pinflow/scripts/wiki-check.mjs:11) watches only the changeset configuration file.

- **New #35:** The current internal audit is self-inconsistent: [`production-audit.md`](/Users/brijeshpatel/Apps/pinflow/docs/audits/2026-07-23-production-audit.md:5) still reports 274 tests, UI-excluding coverage, and obsolete budgets, while later claiming all 34 findings are resolved and that an absent Round 2 transcript is already transcribed.

### Gate evidence

Direct TypeScript, Prettier, and `wiki:check` passed. The cached LCOV includes `src/core/ui/annotator.ts` and corroborates 93.78% line / 91.62% branch coverage.

I could not independently rerun pnpm/Vitest or size-limit in this read-only environment: pnpm and Vitest fail at the protected macOS keychain operation, and size-limit cannot create its temporary directory. Therefore the reported 293 unit, 27 E2E, size-limit, and live Chromium results are accepted as supplied evidence, not independently reproduced. Green suites do not exercise the races and publish paths above.

VERDICT: CHANGES_REQUESTED
