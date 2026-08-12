# Code Review Results - 0.7.0 name-at-export

Date: 2026-08-12  
Request: `docs/audits/2026-08-12-070-name-at-export-review-request.md`  
Scope: merge-base `90b4e8c35cc54d5737811ac2044a8e13247ac419` -> `7c58214028cd982f0f3175a8c52ac148f32a5781` on `feat/061-name-at-export`  
PR: #4  
Diff: 20 files, +789/-116, including the 270-line review request  
Mode: markdown report-only; no implementation fixes applied

Reviewers: correctness, project standards, testing, maintainability, security, API contract, reliability, and frontend race analysis.

- Correctness and reliability focused on the corpus move and artifact output.
- Security focused on stable-handle and stored-name disclosure.
- API contract focused on public export helpers, `onSubmit`, and the pre-1.0 version change.
- Frontend race analysis focused on two tabs, async hydration, and panel lifecycle.
- An independent Claude adversarial pass tested the same diff and corroborated the two-tab data-loss path.

The branch is not ready to merge. The normal suite is green, but seven defects remain. Five are P1 because they can lose or strand comments, disclose an identity that the UI says is omitted, or silently send the wrong reviewer.

### Triage Groups

| Group                                 | Findings       | Context                                                                     | Preferred Resolution                                                                                                                                     | Why                                                                              |
| ------------------------------------- | -------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Identity move safety - apply queue    | #2, #3, #6, #7 | A display-name change also moves persistent state and changes async guards  | Define the rename transaction and cross-tab reconciliation first (#3), then fix duplicate resolution (#2), rendering (#6), and hydration continuity (#7) | One explicit identity-move model prevents four separate forms of split state     |
| Attribution consistency - apply queue | #1, #4, #5     | Each terminal or public export path applies a different anonymous/name rule | Centralize artifact attribution (#1), then route `onSubmit` (#4) and blank-field export (#5) through it                                                  | One attribution value should drive Markdown, filename, JSON, and host submission |

### P1 -- High

| #   | File                            | Issue                                                            | Reviewer                                  | Confidence |
| --- | ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- | ---------- |
| 1   | `src/core/export.ts:284`        | Public artifact APIs expose internal anonymous handles           | correctness, security                     | 100        |
| 2   | `src/core/storage.ts:256`       | Rename keeps a stale target copy and deletes a newer source edit | correctness, reliability                  | 100        |
| 3   | `src/core/storage.ts:265`       | A rename strands later writes from another open tab              | correctness, UI races, adversarial-claude | 100        |
| 4   | `src/core/ui/annotator.ts:2089` | Send to builder ignores the typed reviewer name                  | correctness, API contract, UI races       | 100        |
| 5   | `src/core/ui/annotator.ts:2000` | Clearing the optional field still exports the stored identity    | security                                  | 75         |

#### #1: Public artifact APIs expose internal anonymous handles

Severity: P1  
Confidence: 100. Two review lenses reproduced the output, and the independent validator confirmed the public call paths.

File and symbols:

- `src/core/export.ts`, `exportReviewer()` and `exportFilename()`
- `src/core/ui/annotator.ts`, `Annotator.exportJSON()`
- `src/core/index.ts`, public export re-exports

Reproduction:

- Input: call `exportReviewer()` with a real store whose reviewer is `anon_k3f9x1abq`.
- Observed output: the heading and `Reviewer:` line contain `anon_k3f9x1abq`.
- Input: pass the same handle to `exportFilename()`.
- Observed output: the stable handle becomes the filename's reviewer segment.
- Input: call reviewer-mode `Handle.exportJSON()` for that store.
- Observed output: every exported comment contains `"reviewer":"anon_k3f9x1abq"`.

The sheet's Markdown path happens to be safe because `_buildArtifact()` replaces the reviewer with `''` first. The public pure helpers do not. The current export test also substitutes `reviewer: ''`, so it does not prove that a real minted handle is suppressed. Builder aggregate JSON is the accepted exception and is not part of this finding.

Suggested fix: centralize single-reviewer attribution normalization and use it for Markdown, filename, and reviewer-mode JSON. Preserve raw handles only for the explicitly accepted builder aggregate. Add public-helper and public-handle tests with an actual minted handle.

#### #2: Rename keeps a stale target copy and deletes a newer source edit

Severity: P1  
Confidence: 100. Correctness and reliability reviewers reproduced it independently; the validator confirmed the conflict rule.

File and symbol: `src/core/storage.ts`, `renameReviewer()`

Reproduction:

- Target `Brijesh` contains `cmt_1`, text `stale edit`, `updatedAt=2026-08-11T12:00:00Z`.
- Source `anon_abc` contains the same `cmt_1`, text `new edit`, `updatedAt=2026-08-12T12:00:00Z`.
- Call `renameReviewer(storage, 'p', 'anon_abc', 'Brijesh')`.
- Observed output: the target still contains `stale edit`; the source key and the only copy of `new edit` are deleted.

The implementation creates `seen` from target IDs and appends only source-only IDs. The test asserts the merged ID list but not the surviving content or timestamp. Not reusing `mergeComments()` was correct because its server-disposition policy does not belong in a local rename. The replacement still needs a rename-specific conflict rule.

Suggested fix: for duplicate IDs, keep the whole comment with the later `updatedAt`, with a deterministic target-wins tie rule. Test `text`, `updatedAt`, and disposition fields, not only IDs.

#### #3: A rename strands later writes from another open tab

Severity: P1  
Confidence: 100. Correctness and UI-race reviewers reproduced the storage state. The independent Claude review reached the same result, so the skill's second validator was not needed for this finding.

File and symbols:

- `src/core/storage.ts`, `renameReviewer()` and `saveStore()`
- `src/core/ui/annotator.ts`, `_persist()` and `_adoptTypedName()`

Reproduction:

- Tabs A and B open project `p` as `anon_abc`; both begin with comment `a`.
- Tab A names the reviewer `Brijesh`. Storage now remembers `Brijesh`, copies the corpus, and deletes the anonymous key.
- Tab B still holds `_reviewer='anon_abc'`. It adds comment `b` and persists.
- Observed storage: named corpus is `[a]`; resurrected anonymous corpus is `[a,b]`.
- Reload normally. Identity resolution chooses `Brijesh`, so comment `b` disappears from the UI and every reviewer export. Builder aggregation can also count the split corpus twice.

No storage-event listener or pre-persist reviewer reconciliation exists. Copy-then-delete protects one writer from a refused target write, but it does not make the move safe across live writers.

Suggested fix: add per-project identity-move coordination. A live tab must reconcile its reviewer and store when the remembered reviewer key changes, or `_persist()` must detect that its reviewer is retired and merge into the remembered corpus before writing. Add a shared-storage test with two live `Annotator` instances.

#### #4: Send to builder ignores the typed reviewer name

Severity: P1  
Confidence: 100. Three review lenses found the same branch, a concrete callback reproduction failed, and the validator confirmed it.

File and symbols:

- `src/core/ui/annotator.ts`, `_handleOnSubmit()` and `_adoptTypedName()`
- `specs/pinflow_v1_spec.md`, the `onSubmit` export-sheet contract

Reproduction:

- Start with reviewer `anon_abc123456` and configure `onSubmit`.
- Open the sheet, type `Brijesh`, and click `Send to builder`.
- Observed callback: `payload.reviewer` is still `anon_abc123456`.
- Observed storage: the remembered name is unchanged and the corpus is not moved.

`_handleOnSubmit()` passes `this._store` directly. Only `_handleReviewerExport()` calls `_adoptTypedName()`. This contradicts the documented rule that Send to builder and Export and share are equivalent terminal paths from the same sheet.

Suggested fix: call `_adoptTypedName()` before reading `this._store` in `_handleOnSubmit()`. Add a test for the callback reviewer, remembered identity, and moved storage key. Preserve the accepted unattributed behavior when the move itself fails.

#### #5: Clearing the optional field still exports the stored identity

Severity: P1  
Confidence: 75. The security reviewer reproduced the copied output and an independent validator confirmed the control flow. The remaining uncertainty is product semantics: the UI does not explicitly say that clearing a prefilled name is an export-only opt-out, but its label says the field is included in the export.

File and symbols: `src/core/ui/annotator.ts`, `_adoptTypedName()`, `_displayName()`, and `_buildArtifact()`

Reproduction:

- Begin with remembered reviewer `Brijesh`.
- Open the sheet, clear the prefilled optional name, and export.
- Observed output: the heading still attributes the artifact to `Brijesh`, and the `Reviewer:` line is still present.

The blank value makes `_adoptTypedName()` return. `_displayName()` then reads the unchanged stored reviewer. This can disclose a name after the reviewer removed it from the visible export field.

Suggested fix: treat blank input as an export-scoped empty attribution without renaming or deleting the persisted corpus identity. Capture that attribution with the generated artifact so confirmation-panel retry actions do not rebuild it with the stored name.

### P2 -- Moderate

| #   | File                            | Issue                                                      | Reviewer    | Confidence |
| --- | ------------------------------- | ---------------------------------------------------------- | ----------- | ---------- |
| 6   | `src/core/ui/annotator.ts:2005` | Target-only merged comments stay hidden in the live widget | correctness | 75         |
| 7   | `src/core/ui/annotator.ts:282`  | Rename cancels an in-flight source hydration               | correctness | 75         |

#### #6: Target-only merged comments stay hidden in the live widget

Severity: P2  
Confidence: 75. A reviewer reproduced the DOM/store disagreement and the validator confirmed that no render follows the store switch.

File and symbols: `src/core/ui/annotator.ts`, `_adoptTypedName()` and `_renderPins()`

Reproduction:

- Anonymous source corpus contains `c1`; existing `Brijesh` target contains `c2`.
- Name the reviewer `Brijesh`.
- Observed state: `_store.comments` contains `[c2,c1]`, but the shadow DOM still contains one pin and the chip still reads `1`.
- The immediate export includes both comments, so the UI and artifact disagree.

Suggested fix: call `_renderPins()` after loading the renamed store. Add a UI test whose target already contains a target-only comment.

#### #7: Rename cancels an in-flight source hydration

Severity: P2  
Confidence: 75. A reviewer reproduced the dropped response and the validator confirmed the identity guard.

File and symbols: `src/core/ui/annotator.ts`, `_hydrateFromSource()` and `_adoptTypedName()`

Reproduction:

- Begin with a local anonymous comment and a pending `source()` promise.
- Name the reviewer `Brijesh` before the promise resolves.
- Resolve the promise with a server-only comment.
- Observed state: only the local comment remains. The guard sees a different `_reviewer`, drops the response, and starts no replacement hydration.

`reviewer` is documented as a display label. A display-name change should not silently cancel the current session's data read.

Suggested fix: guard hydration with a stable session or identity generation instead of the mutable display string, or start exactly one replacement hydration after a successful rename.

### Actionable Findings

| #   | File                            | Issue                                                 | Route                               | Notes                                                          |
| --- | ------------------------------- | ----------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| 1   | `src/core/export.ts:284`        | Anonymous handles escape through public artifact APIs | `gated_auto -> downstream-resolver` | Central normalization plus public API tests                    |
| 2   | `src/core/storage.ts:256`       | Duplicate-ID rename deletes the newer source edit     | `gated_auto -> downstream-resolver` | Newer-`updatedAt` merge plus content assertions                |
| 3   | `src/core/storage.ts:265`       | Another tab can resurrect and strand the old corpus   | `manual -> downstream-resolver`     | Requires a cross-tab identity-move rule and interleaving tests |
| 4   | `src/core/ui/annotator.ts:2089` | Send to builder ignores the typed name                | `gated_auto -> downstream-resolver` | Adopt before callback and test storage plus payload            |
| 5   | `src/core/ui/annotator.ts:2000` | Clearing the field still exports the stored name      | `gated_auto -> downstream-resolver` | Export-scoped attribution decision plus regression test        |
| 6   | `src/core/ui/annotator.ts:2005` | Merged target comments stay hidden                    | `gated_auto -> downstream-resolver` | Render immediately after the store switch                      |
| 7   | `src/core/ui/annotator.ts:282`  | Rename drops pending source data                      | `gated_auto -> downstream-resolver` | Stable hydration guard or one replacement hydration            |

### Review of the seven requested questions

#### A. `renameReviewer()` data safety

Checked, and not safe yet.

- Target-write refusal is ordered correctly. The instance-level quota spy intercepts the exact target key, and the test asserts that the source remains. Deleting first or swallowing the refused write makes the test fail.
- The target merge is unsafe for duplicate IDs (#2).
- Two tabs split and strand one person's corpus (#3).
- Keeping the target's `createdAt` is reasonable. No internal selection, merge, or rendering logic depends on it; when folding into an existing target corpus, retaining that corpus's creation time is coherent.
- If source-key removal throws after the copy, both stores remain. That avoids loss but builder aggregation can double-count the same comments. This failure path is not tested.
- `rememberReviewer()` runs after the target copy and source deletion and swallows its own failure. A selective failure of that final identity write can leave the remembered anonymous handle pointing at a deleted key while the named corpus exists. This is a concrete transaction boundary, but I did not reproduce it against a real browser quota condition because the larger target write succeeded first and the later identity write is much smaller. Add fault-injected storage coverage before calling the move failure-safe.

The decision not to reuse `mergeComments()` was sound. Its server-specific disposition rule is wrong for a local key rename. A smaller rename-specific latest-update merge is the right response.

#### B. Sync hosts and identity changes

No universal `onChange` defect is proven under protocol v3. The protocol describes `reviewer` as a display label, not an authentication or authorization key, and `onChange` can represent only comment add/update/delete events. Emitting fake comment events would overload that contract.

There are still two real concerns:

- Pending source hydration is definitely dropped by the label change (#7).
- A host that shards remote state by the reviewer label has no identity-move signal. That host can strand the remote anonymous corpus. The current protocol does not define whether such sharding is supported.

If remote label migration is required, add a dedicated optional identity-change callback such as `{ from, to, store }`. Do not silently reinterpret `onChange`. Blocking rename whenever `source` exists is safe but unnecessarily removes the feature from sync hosts.

#### C. Public `exportFilename()` contract and versioning

The `''` case is an intentional public API break. `0.6.0 -> 0.7.0` is the correct release size for this pre-1.0 package. The change should be described explicitly as a breaking semantic change for callers that used `''` as aggregate; it should not be presented as backward compatible.

The in-repo aggregate caller passes `null`, so it remains correct. External callsite completeness cannot be proven from this checkout.

#### D. `isAnonymous()` prefix test

The prefix test is not robust. Exact input `anon_dave` is accepted as a host or typed reviewer name, but `_displayName()` returns `''`; Markdown loses its author and the filename loses its reviewer segment. The source documents this as an accepted collision, so this report treats it as a design risk rather than an additional blocker.

The smallest safer rule is the actual minted shape, for example `^anon_[a-z0-9]{9}$`, with a test that `anon_dave` remains attributed. Explicit anonymous state is more robust but costs more API and storage surface.

#### E. Artifact paths and name-field lifecycle

Checked.

- Public `exportMarkdown()` and `downloadExport()` intentionally have no name prompt. Their widget paths suppress a minted handle through `_displayName()`.
- Builder Markdown and JSON retain raw handles by the accepted out-of-scope rule.
- The keyboard shortcut opens the same sheet, so it reaches the name field.
- No close-between-click-and-read race was found. `_adoptTypedName()` reads `_nameEl` synchronously before the first await, and `_closePanel()` clears it.
- No stale `_nameEl` reuse was found. Each sheet assigns a new field and close nulls it.
- Send to builder is the uncovered terminal path and is broken (#4).
- Clearing a prefilled name is also broken (#5).

#### F. Stealth storage silence

Checked and fine.

- Stealth init omits `mint`; `resolveReviewer()` returns `null` without writing `pinflow:r:<project>`.
- Source hydration exits while reviewer is `null`.
- First activation resolves one minted handle, remembers it once, and both subsequent comments use the same corpus.
- The tests assert that init creates no reviewer key, activation creates one stable minted key, and no `null` corpus key exists.
- `_ensureIdentity()` still guards comment creation if the injectable resolver returns `null`, even though the normal production mint path no longer prompts or declines.

#### G. Do the tests bite?

Some do, but the suite is incomplete at the boundaries that failed review.

- The corrected quota test bites. Its instance spy targets the write that matters and its source-preservation assertion fails if the target write is not actually refused.
- The coarse-pointer theme test bites. It requires the coarse-pointer rule and requires both `.input textarea` and `.panel input.name`; deleting the rule or either selector makes it fail.
- The blank-name test begins with a real `anon_...` reviewer and asserts that the exact handle is absent. It would fail if `_displayName()` returned the handle.
- Deleting the old prompt-decline integration test did not remove a current product contract. Lower-level deferred-identity tests still verify that a `null` resolver aborts activation safely.
- `reviewer: ''` reaches the same public noop-handle branch that a declined prompt used to reach. The trigger changed, but the handle contract under test did not.
- Stealth's new tests prove no init identity write and one stable identity after activation.

The missing tests correspond directly to current defects: typed-name `onSubmit`, duplicate-ID content conflict, two live tabs, merged-target rendering, pending hydration during rename, and clearing a prefilled name. The Enter handler is also untested; all six new sheet tests click buttons.

### Coverage

- Local verification: `pnpm test` passed 45 files and 584 tests, with 2 conditional skips.
- Changed-path verification: 6 focused files passed 128 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm size` passed: core IIFE 18.24 kB / 18.32 kB, core ESM 17.87 kB / 17.95 kB, voice 4.43 kB / 4.45 kB, React 468 B / 470 B, Vue 587 B / 610 B.
- Cross-model adversarial review: `cross_model_route=claude`, `model_requested=opus`, `effort_requested=high`, `receipt_supported=true`, `model_actual=claude-opus-4-8`, `effort_actual=unverified`, `independence_verified=true`.
- Validator shortcut: #3 skipped because it had quoted evidence from an ordinary reviewer and an independently routed Claude reviewer.
- Validator batch: #1, #2, #4, #5, #6, and #7 all validated; 0 dropped and 0 validation-degraded.
- Final confidence gate: 0 findings suppressed. Two single-source advisories were routed to soft buckets: the Enter-only coverage gap and the sync-host identity-migration contract ambiguity.
- Reviewer failures: none.
- Settlement suppression was not evaluated because the review request is not an implementation plan with settled design markers.

Residual risks:

- A failed source-key removal can leave both corpora and double-count builder aggregate comments.
- A target copy followed by a failed remembered-identity write can strand the named corpus from normal reviewer resolution.
- Sync hosts that use the display label as a remote shard key need a dedicated migration contract.
- The `anon_` prefix reserves legitimate names without a user-visible warning.
- External callers that used `exportFilename(project, '', ...)` as aggregate will receive a different filename.
- Rapid repeated export actions can start duplicate clipboard/download work, although the ownership guard prevents stale confirmation UI and stale clearing.

Testing gaps:

- No two-live-annotator storage interleaving test.
- No duplicate-ID conflict test that asserts content and `updatedAt`.
- No typed-name Send to builder test.
- No prefilled-name clearing test.
- No reviewer-mode public JSON test with an actual minted handle.
- No pending-source rename test.
- No merged-target pin/count render test.
- No Enter-to-export keyboard test.
- No selective failure test for target-copy success followed by remembered-identity failure.

---

### Verdict

> **Not ready.**
>
> **Is the evidence that this change is safe actually evidence? No.** It is valid evidence for the happy path, the refused target write, stealth silence, theme coverage, type safety, buildability, and byte budgets. It is not evidence for the identity move as a transaction or for parity across public and terminal export paths. The reproduced P1 cases show that the current green suite can still lose a newer edit, strand a second tab's comment, leak the internal handle, submit the wrong reviewer, and ignore a visible attribution opt-out.
>
> **Fix order:** define the cross-tab identity-move rule (#3) -> preserve the newest duplicate (#2) -> centralize artifact attribution (#1) -> align terminal sheet actions (#4, #5) -> repair UI and hydration continuity (#6, #7).

Prioritized actionable recap:

- **#3 [P1] `src/core/storage.ts:265`** -- another tab can resurrect and strand the retired corpus. Response: manual concurrency rule plus two-instance tests.
- **#2 [P1] `src/core/storage.ts:256`** -- duplicate-ID rename deletes the newer source edit. Response: deterministic latest-update merge plus content assertions.
- **#1 [P1] `src/core/export.ts:284`** -- public Markdown, filename, and reviewer JSON paths can expose `anon_...`. Response: central single-reviewer attribution normalization.
- **#4 [P1] `src/core/ui/annotator.ts:2089`** -- Send to builder ignores the typed name. Response: adopt before callback and verify payload plus storage.
- **#5 [P1] `src/core/ui/annotator.ts:2000`** -- clearing the optional field still exports the stored identity. Response: export-scoped attribution and retry-safe artifact capture.
- **#6 [P2] `src/core/ui/annotator.ts:2005`** -- merged target comments stay hidden. Response: render after store switch and test the chip and pins.
- **#7 [P2] `src/core/ui/annotator.ts:282`** -- rename drops pending source data. Response: stable hydration guard or one replacement hydration.
