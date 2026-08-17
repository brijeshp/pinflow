# Changelog

## 0.9.0

### Minor Changes

- f92027f: Builder mode becomes an export switch instead of a screen.

  `mode: 'builder'` used to draw its own chrome: a drawer listing every reviewer with a checkbox, read-only pins for other people's comments, and a Clear all button. That is gone. What remains is the part that was doing the work — `exportMarkdown()`, `exportJSON()` and `downloadExport()` still span **every reviewer store in the browser**, and `exportBuilder()` is still exported for hosts rendering artifacts from their own data.

  **Why remove rather than keep.** The drawer aggregated `localStorage`, which means it aggregated one _browser_, never a team — reviewers on other machines were never in it, and the guide already said so ("not an administrative or authenticated area"). A real multi-reviewer tier is backend-shaped and would not be built on that data layer, so the UI was a placeholder that could only ever be rewritten, not extended. Nothing was using it. Keeping it meant maintaining ~600 B of chrome threaded through the annotator's state machine — the file most likely to change — in exchange for option value that does not exist.

  The last commit containing it is tagged **`builder-mode-final`**; `git show builder-mode-final:src/core/ui/annotator.ts` retrieves it whenever the paid tier wants to look.

  **What this changes for a host.** `init({ mode: 'builder' })` now renders nothing of its own: no chip, no drawer, no foreign pins. Reach the aggregate through the handle. If you were relying on the on-page drawer, that affordance is gone; if you were relying on the aggregate export — the documented purpose — nothing changed.

  Budget: −582 B gz IIFE / −593 B ESM. That more than repays the ESM ceiling raise this release took for the artifact-quality fixes, and both entries now sit well below where the release started.

- 2988f25: Scope hotspots, corrected against a real export — and the bundle golfed to pay for it.

  **Where this came from.** Not a review pass: an audit of an actual artifact, five comments a reviewer left on a real page, measured against the bar the scope model was built to clear — can a coding agent act on this file without going back to the reviewer? Four of the five notes cleared it. One failed in a way neither party could see, and the `confidence` field turned out to be **anti-correlated with usefulness**.

  **`**Do not change:**` is no longer binding.** It was the most authoritative sentence in the artifact and it made the _weakest_ evidence in the record absolute. An exclusion is a bare coverage ratio against a hand-drawn rectangle — geometry, not intent — while the boundary beside it comes from a real containment test and already carried an explicit override clause. On the audited export that inversion turned a ~1% overhang past a grid gutter into a prohibition on two of the five bullets the reviewer had asked to fix: the artifact forbade the only coherent fix. It now reads as what the region _grazed_, for that note alone, with a deterministic default — prefer leaving them, change one if a coherent fix needs it and say so. "Confirm first" was rejected as a replacement: it has no addressee in a pipeline whose premise is no round-trip.

  **A region that slices a repeated set now says so.** `**Change — 2 of 5 `<li>`**` instead of `**Change — 2 element(s)**`. A rect cutting one column of a three-column grid emits some cells as members, the grazed column as exclusions, and an untouched column _nowhere_ — three states, of which the artifact rendered two, so the counts read as a deliberate permission list over a set the reviewer meant whole. The members are deliberately **not** widened to their parent: promoting a partial cover to its container is the exact bug the covered-set model exists to prevent.

  **R4 now applies to marquees.** The region branch assigned a rung and published its confidence unchecked, so a marquee resolving to the whole page shipped at `medium` while a tightly-scoped point pin shipped at `low`. Only the share-of-descendants half applies there: the viewport half compares an element's full scroll box against one screen, which on any content page is a "taller than the screen" test — measured at 1.97 viewports for a section holding 18.7% of the document. Reusing it wholesale would have demoted ordinary sections and flattened every note in an export to `low`, and the agent pack tells agents to verify at low confidence, so that manufactures a round-trip per note.

  **`**Area covers:**` names the block the sample hit**, not the highest child beneath the containing ancestor. A rect drawn slightly wider than its block used to walk past it and quote a sibling's opening text while `**Position:**` still pointed at the right place — a disagreement nothing in the artifact could reveal.

  **Also:** the source hint resolves from an _ancestor_, so host instrumentation reaches marquees whose boundary is a plain wrapper; `text-align` joins the computed snapshot when non-default, because "left align this" is ambiguous between text alignment and un-centring a block; and the exclusion cap and label cap stop truncating in silence.

  `SCOPE_GEN` moves to 2 — marquee confidence means something different than it did under gen 1, and `siblings` did not exist. Records written by older builds still hydrate.

  **Size.** `treeshake` was missing from the IIFE entry alone, shipping a dead CJS-interop preamble: −191 B. Four duplicated shapes golfed out of the UI and the validators: −87 B more. IIFE ends **below** where it started despite everything above. ESM's ceiling rises as a deliberate, approved trade — the golf freed 278 B there against only 91 B on ESM, and the alternative was dropping the fix that resolves the one proven wrong-edit.

  Known limitation, measured and recorded: an area sample is not clamped to its nearest block, so it can quote an inline fragment mid-sentence. Clamping cost 76 B gz and the budget had room for that or the N-of-M note, not both.

## 0.8.1

### Patch Changes

- 52ac6c0: Scope labels arriving from the wire are sanitised the same way captured ones are.

  `scope.ts` strips control characters, zero-width and BOM, bidi overrides and isolates, and the Unicode tag block from a scope node's label at capture — and its own comment says why: the value "flows into localStorage, the JSON export and the host's `onChange` payload, all of which bypass the markdown escapers entirely." The hydration boundary, which serves backends, imported exports and tampered blobs and is therefore strictly the less trusted of the two, re-applied the length cap but not the strip. So the one boundary whose job is to distrust the wire let invisible instruction-smuggling through, into the lines the release's own trust preamble calls the most authoritative in the artifact.

  The sanitiser now lives in `scope-limits.ts` — the module that exists precisely so capture and hydration can agree without importing each other — and both call it, on `label` and on `testid`. It takes `unknown` rather than `string`, because the hydration call site reads an untrusted record and a cast there would let a number reach `.replace` and throw, discarding a whole store to save one bad field.

  `tag` and `css` are now bounded (40 / 1024) at that boundary. Every other untrusted string on a record was already capped — `textFingerprint` to `FP_MAX`, `resolution` to 500 — and these two were not, so a single hydrated payload could carry an unbounded string into every future export and every `onChange` call. An over-long node is rejected rather than truncated: a clipped css path is a selector that may match a different element than the reviewer drew around, which is worse than no hint, and losing a hint never loses their words.

## 0.8.0

### Minor Changes

- cb0084a: Blast radius: every annotation now states what an agent may change, and the boundary it may not leave.

  **The problem.** A single element served as both identity and scope, and the code resolved that tension by silently widening the identity. A pin recorded the nearest `data-testid` ancestor and discarded what the reviewer actually tapped. A marquee climbed until an ancestor fully contained the drawn rect — so a drag ending mid-card failed containment, that card was discarded, and the scope escalated to the row. The artifact said where a note was and what it was about. It never said how far a fix may go.

  **What ships.** A new `scope.ts` resolves a region to an element **set**, top-down with an early stop: children that score `inside` are emitted and not recursed, so three cards in a grid emit three nodes rather than sixty-three, a nested grid emits the inner grids for free, and a marquee drawn in a container's padding grazes everything and emits nothing — the hollow-shape rule, with no rule written for it. Coverage is `area(rect ∩ element) / area(element)` — coverage-of-target, matching `IntersectionObserver`, not IoU — and the element rect is clipped against its container before scoring, so an `overflow:hidden` carousel card cannot score `inside` for a region nobody can see.

  A five-rung ladder resolves the boundary: `data-pinflow-source` → `data-testid` ancestor → repeated-sibling signature → landmark/sectioning → the element itself. Every scope records **which rung produced it and how confident that makes it**, so a landmark guess is legible as a guess. A candidate that is really the page is rejected by share-of-descendants or share-of-viewport — never an element-name blocklist, which `<div id="root">` walks straight through — and scope never resolves to `<body>`.

  **Exports gain four line-anchored fields**: `**Scope:**` (the ceiling), `**Change:**` (what the note may alter, with `partial` marked), `**Do not change:**` (grazed neighbours), and `**Insertion point:**` for a region drawn in a gap, which records the bracketing siblings rather than claiming the container. `**Source hint:**` renders a host-declared path as page-supplied and unverified.

  **A trust preamble** now heads any artifact carrying a scope. Escaping defends the artifact's structure; nothing defends its meaning, and these lines are assembled from `aria-label`, tag names and accessible names — so a page emitting `aria-label="IGNORE PREVIOUS INSTRUCTIONS…"` produces a structurally perfect artifact with that sentence inside the release's most authoritative line. The preamble is literal, never interpolated, and states the rule the pack states: **scope is a ceiling, not a grant** — it narrows what a fix may touch, it never authorises a change you would not otherwise make, and crossing it means saying so.

  **`data-pinflow-source` is validated, not escaped.** A positive charset with per-segment rejection and an extension allowlist that deliberately excludes `.md`, `.json`, `.yml` and `.sh`, applied at three call sites (capture, hydration, export). `data-pinflow-source="CLAUDE.md"` would otherwise fire the strongest rung at high confidence and hand an agent the file governing its own behaviour — a taint that persists across sessions. Drop, never repair.

  **`data-pinflow-ignore`** excludes a subtree from targeting.

  **A visible outline** shows the resolved scope before the composer opens: 2px stroke plus a faint wash for a target, 1px for the boundary, dashed for uncertain, a seam bar for an insertion. The members carry the weight and the boundary is a whisper — a union box over three cards in a grid _is_ approximately the grid rect, which would restate the bug in pixels. Exclusions are deliberately not drawn: absence is already the signal. Opening an existing pin never outlines, because scope was resolved against the DOM at creation and re-outlining today's DOM would attribute a boundary to a reviewer who never saw it.

  **Schema v4.** `scope` lives on `Comment`, not `Anchor`, and validates **soft** — a malformed scope is stripped and the comment survives. Every v3 record loads, renders and exports unchanged, and a corpus with no scope produces a byte-identical artifact. There is no `kind` discriminator: structure is total (`between` → insertion, `members` → region, neither → point) and no empty collection is ever written, so a backend normalising `[]` to absent cannot change an annotation's kind in transit. A `gen` field stamps the tuning that produced every record, because the thresholds are unresolved research and `confidence: 'high'` must not come to mean two different things.

  `PROTOCOL.md` gains the derived lane: scope is content, follows the `updatedAt` winner, and a v3 backend that has never heard of it cannot strip a scope the reviewer's device derived.

  **A healed anchor demotes its scope** — members and exclusions are dropped, confidence floors, and the record is marked `stale`. The derived lists describe a DOM that no longer exists, and keeping them would let an artifact name elements with total confidence that were never in the drawn region.

  **Breaking:** `SCHEMA_VERSION` is 4, so `exportJSON`'s `pinflowExport` field reads `4`. Anything parsing that value should accept it. The stored shape is additive; no migration runs and nothing is rewritten.

  **Size, honestly.** Core moves from 17.90/17.55 KB gz to **21.80/21.43** (macOS; linux CI runs ~20–30 B heavier) — **+3.9 KB**, ceilings to 21.91/21.53 KB (razor-thin over the linux CI actuals of 21.86/21.48), an owner-approved raise under the ratchet policy in `docs/wiki/build-and-release.md`, re-ratcheted razor-thin over the CI actual. This is well above the 1.3–1.9 KB the plan projected, and the reason is worth recording: the plan's estimate assumed two of its three named byte-levers (dropping the touch marquee, dropping ladder rung (c)) would be pulled, and neither was — this release ships the full requirement set including insertion records and the repeated-sibling rung. The scope engine, the outline renderer, the record validator and the export emitters are four surfaces, not one.

  Ladder rung (c) departs from the plan's design. The specified word-like class filter (`/^[a-z\-]{3,}$/i`) rejects `gap-4`, `w-1/2` and `md:flex`, making it blind in exactly the Tailwind output it targets, while the utility soup that does pass is shared by every `<div>` on the page. The signature here is the child-tag sequence, which is class-independent; class overlap survives only as a fallback for childless elements.

## 0.7.0

### Minor Changes

- f52eeea: Nobody is asked who they are at page load; the export sheet asks instead, and the name is optional.

  **The `window.prompt` at init is gone.** A first-time reviewer met an unexplained OS dialog before they had read a word of the page — on a phone it reads as a broken site, and in a sandboxed iframe without `allow-modals` (Lovable, Bolt, StackBlitz, CodeSandbox — where these prototypes actually live) `prompt()` throws rather than returning null. A dismissed or blocked dialog produced an inert handle, and because that early return preceded the boot line, it printed _nothing to the console_: indistinguishable from a widget that never loaded. Reviewers now get a minted handle (`anon_…`) and a corpus of their own, silently.

  **The export sheet carries an optional name field.** It is the one moment attribution matters and the only one where the reviewer has any context for the question. Prefilled if they have named themselves before, skippable, and Enter exports. Naming yourself **moves your comments**: the storage key embeds the reviewer (`pinflow:c:<project>:<reviewer>`), so this is a key move, not a field edit — copy-then-delete, so a refused write leaves the comments exactly where they were. Naming yourself something you have used before on that browser folds the two sets together instead of shadowing one.

  **An unnamed export claims no author.** The minted handle is a storage key, not a person, so it never reaches an artifact: the heading is `# Feedback for <project>` with no `— from`, there is no `Reviewer:` line, and the filename drops the who segment (`pinflow-feedback-<project>-<ts>.md`) without borrowing the builder aggregate's label. Previously every export from a host that set `config.reviewer` to a placeholder carried that placeholder — several reviewers' files would all land in one downloads folder under the same name.

  That rule now lives in one exported function, `attribution()` in `src/core/export.ts`, and every public entry point obeys it: `exportReviewer`, `exportFilename`, and single-store `exportJSON`, including the toolkit re-exports hosts run server-side. The builder aggregate (`exportJSON` with an array) deliberately keeps raw handles so two unnamed reviewers stay distinguishable.

  **Clearing the name field is an export-scoped opt-out.** The field says it is included in the export, so emptying it removes attribution from that artifact — without renaming anything or disturbing the identity the corpus is filed under. The confirmation panel's retry buttons re-send the artifact that was already built rather than rebuilding it, so they cannot resurrect a name the reviewer just removed.

  **Send to builder settles the name too.** It is the sheet's other terminal action and equivalent to Export & share by contract, so `onSubmit` now receives the typed name rather than the handle it replaced.

  **Breaking, for direct callers of `exportFilename`:** passing `''` used to produce the builder aggregate name (`<project>-aggregate`) and now produces `<project>`. `null` still means the aggregate. In-repo callers are unaffected.

  Existing reviewers are unaffected: a name already remembered under `pinflow:r:<project>` still wins over minting, so their identity and their comments stay put.

  **Two tabs no longer split a corpus.** A rename retires a storage key that another open tab may still be writing to, and identity resolution never looks at that key again — so the second tab's comments would vanish on reload. Each persist now checks whether the remembered reviewer has moved and folds forward into it. Folding a corpus into an existing one resolves duplicate ids by newest `updatedAt` (ties to the destination) rather than by id alone, which previously discarded the newer edit.

  Core grows ~470 B (18.14 kB ESM gz), an approved trade against ceilings raised to 18.22 kB ESM / 18.56 kB IIFE.

### Patch Changes

- ebb7632: Coarse-container anchors no longer produce misleading exports.

  A reviewer pinning empty space, or dragging a marquee across sibling elements, anchors to a page-level container — there is genuinely nothing tighter under the cursor, and a rect spanning siblings has no tight common ancestor. That part is correct and unchanged. What was wrong is everything the export then said about it: the quoted preview was the container's first 80 characters, which on a long page describes a completely different screen, and an agent reading it in good faith edits the wrong thing.
  - **`**Element:**` shows the real tag.** An id-anchored element's css path is bare `#main`, which carries no tag segment, so the label rendered the literal `<element id="main">` — not an HTML tag, and a false grep target. The tag is now recovered from the xpath's last step.
  - **A truncated preview says so.** A fingerprint that hit the 80-char cap now ends `…`, so it no longer reads as the element's complete text.
  - **`**Area covers:**` names what the rect was drawn over.** Area comments record up to three labels of the blocks the drawn rect actually sampled, via the new optional `Anchor.covers`. The comment still anchors to the containing ancestor, so persistence, healing, reflow and footprints are untouched — this only names what the ancestor's own text cannot.
  - **`**Context:**`gains its`under '…'` clause on area comments.** The nearest heading is now taken from the block under the rect rather than from the climbed container, which typically has no heading above it at all. Only the heading moves; selectors, fingerprint, name, role and styles still describe the anchored element, so the block cannot contradict itself.
  - **A malformed `textFingerprint` no longer discards the whole store.** `null`/absent passed validation and was then dereferenced during hydration, throwing a `TypeError` that took every other comment with it. Such a record is now dropped on its own.
  - **The agent pack teaches the container case** — the only part of this release that helps comments already exported.

  Deliberately not done: refusing or redirecting a pin. A predicate that rejects a legitimate full-page pin (a single-screen app where the pinnable thing really is the whole page) would be worse than the bug; a regression test pins that behaviour.

  Known limitations, both accepted deliberately: the three samples run down the rect's diagonal, so a marquee over a 2x2 grid can miss the anti-diagonal members (per-candidate area-ratio scoring would fix it and did not fit the budget); and the trailing ellipsis on a text preview means "80 characters or more", not "provably truncated" — only the capped representation is stored, so text of exactly 80 characters carries it too. Recording real truncation provenance would need a persisted flag, which is new schema surface and bundle bytes for a rare boundary whose worst case is an agent believing there is slightly more text than there is.

  **Size:** core grows ~210 B gz. Ceilings notch to **18.21 KB IIFE / 17.85 KB ESM**, set from the linux CI actuals (18.16 / 17.80) with the ~50 B margin the budget policy in `AGENTS.md` calls razor-thin — an owner-approved trade, not a drift.

## 0.6.0

### Minor Changes

- e13afd5: Export confirmation offers both channels as actions; the email hand-off is removed.

  **The panel now acts instead of apologising.** Exporting still downloads the Markdown and copies it to the clipboard on the way through. The confirmation then offers both again as buttons — **Download Feedback Markdown** (primary) and **Copy to Clipboard** — plus **Done**. This matters because one of those channels cannot be verified: `download()` fires a detached `a.click()` that returns `void`, and it no-ops outright in some in-app webviews, which is exactly where a reviewer on a phone ends up. The old panel could only describe that failure in prose; now the reviewer has a button. The body copy still asserts only the clipboard, the one result the widget can observe, and the retry reports honestly — `Copied to your clipboard.` or `Copy failed — use the download instead.`

  **Breaking: `config.submitTo` is removed.** It existed solely to add an "Email it to the builder" `mailto:` button to that panel. Drafting an email was never a good fit for the moment — Pinflow does not know who the reviewer is beyond a display name, and the recipient was the host's guess, so the action opened an empty draft the reviewer had to finish by hand. Hosts that need a submission channel should use `onSubmit` (host-owned function) or `onChange`/`source` (backend sync); everyone else shares the file or the clipboard however the team already works. The Vue wrapper's `submitTo` prop is removed with it.

  Panel button rows now wrap instead of squeezing. `flex:1` gave every button an equal share of a 320px panel, so the longer primary label collapsed into a three-line stack; buttons now size from content with a floor, and a row that does not fit breaks — the primary takes its own line and the rest share the next. Two-button rows (the export sheet) are unchanged.

  Removing the `mailto:` construction frees more than the two buttons and the wrap rule cost, so this change is size-negative on its own; the net ceiling movement for the release is accounted for in the input-ownership changeset.

### Patch Changes

- e13afd5: Input ownership: thirteen ways an annotation gesture leaked into the host page, or kept hold of input it no longer owned.

  Armed mode and the stealth gesture both promise that a gesture pinflow accepts is pinflow's — the host page sees neither its pointer phases nor its trailing click — and that everything else reaches the host untouched. Seven paths broke that promise. All are now pinned by `tests/core/input-ownership.test.ts`.
  - **Armed clicks reached host window-capture listeners.** `_onDocumentClick` used `stopPropagation()` at three sites while every neighbouring armed handler used `stopImmediatePropagation()`. The two are not interchangeable here: this handler is on window capture, and so is a host's outside-click dismiss, router, or analytics listener. A sibling on the same node cannot be silenced by `stopPropagation`, so any host listener registered after init saw every armed click.
  - **A long touch hold leaked its click.** The stealth long-press fires while the finger is still down, but the click-swallow was armed at that moment rather than at release, so the 700 ms window was spent during the hold. Past ~1.2 s the host received the trailing compatibility click — on a prototype, a real navigation or submit under the reviewer's finger. The release now arms it, matching what the suspend and Escape paths already did.
  - **A retired press could brick the gesture layer.** A killed press stayed in the press slot to keep its release shielded, and only its own release could clear it — but touch and pen mint a fresh pointer id per contact, so a release lost outside the window left the slot occupied for the life of the page, with the page's text selection and context menu suppressed alongside it. The shield is now a bare pointer id with its own bounded lifetime: the multi-touch guard it provided is unchanged, but it can no longer outlive the gesture it belongs to.
  - **An aborted marquee leaked the accepted pointer's release.** Its `pointerdown` had already been eaten when the press was claimed, so handing the host a `pointerup` with no matching `pointerdown` desynced any drag surface.
  - **An aborted marquee had no recovery.** Lost-release recovery was gated on the gesture not being aborted, so one lost release stranded the marquee state and left a standing window-capture guard eating every click on the page. Any participant re-pressing now retires it.
  - **A stranded abort locked the reviewer out of the dock.** The abort guard and the post-drag click swallow are blanket window-capture killers that ran ahead of the own-UI check, so the arm segment's own click was eaten and there was no way to disarm. Pinflow's chrome is now checked first everywhere.
  - **`destroy()` leaked the dying-press shield.** It adds three window-capture listeners that retire on the shielded pointer's next event — an id that, for touch and pen, never comes back. A destroyed annotator went on swallowing host input and held its shadow tree alive. Shields and the one-shot click swallow are now tracked and drained on teardown.

  Six further touch and pen defects, from the same pass:
  - **Compatibility `mousedown`/`mouseup` were never suppressed on touch, in either activation path.** Cancelling a `pointerdown` suppresses compatibility mouse events for mouse input only; for touch the spec routes that through `touchstart`, which a passive annotation layer must not claim. So every long-press _and_ every armed tap also reached the host's `mousedown`/`mouseup` handlers — canvas surfaces, drag targets and `:active` widgets all reacted to annotation gestures, even though the click itself was correctly swallowed. Both paths now swallow the whole compatibility burst. The armed half of this was found by the new touch E2E suite, not by review.
  - **The long-press threshold tied with the platform's.** WebKit and Chromium fire their own long-press recognizers at ~500 ms, so an equal threshold was a per-device coin flip: lose and the platform takes the gesture (pinflow silently does nothing), win and the draft opens under iOS's selection handles. Now 400 ms, which lands first.
  - **A delayed compatibility click placed a spurious pin.** The annotator's click swallow cleared on the next task, on the reasoning that a click follows its `pointerup` synchronously — true for mouse, false for touch, where iOS still applies a ~350 ms tap delay on pages without a responsive viewport. It is now a bounded 700 ms window, matching the gesture controller's; pinflow's own chrome is exempt, so the draft popup's buttons stay live.
  - **Pen and stylus could not annotate at all in stealth mode.** Apple Pencil and the Surface pen report `pointerType: 'pen'`, which was routed into the desktop branch and required an Alt key the hand holding a stylus does not have. Pen now uses the long-press path with touch.
  - **Dismissing a draft by tapping outside also operated the host control underneath.** The tap meant "close this", not "click that" — the trailing click now gets swallowed with the dismissal.
  - **`Alt+drag` is the window-move binding on GNOME and KDE**, where the window manager takes it before the browser sees it. Documented in `README.md`, with the dock and `activation: 'toggle'` as the answers there.

  **Also fixed: pinflow failed to load at all inside a sandboxed iframe.** A sandboxed iframe without `allow-modals` — Lovable, Bolt, StackBlitz and CodeSandbox previews, which is where these prototypes actually live — makes `window.prompt` **throw** rather than return null. The identity prompt did not guard it, so the exception escaped `init()` and the widget never mounted. A prompt the environment refuses to show is now treated as an unanswered one, degrading to no identity exactly like a cancelled prompt. Found by running the demo, not by reading the code.

  **New: real touch coverage.** `tests/e2e/touch.spec.ts` drives `page.touchscreen` on a mobile profile, so the long-press grammar, the compatibility mouse burst and the trailing click are exercised in a real engine. The existing E2E suite used `page.mouse` and `locator.click()` throughout, which synthesize _mouse_ input — the two "mobile" projects were running the desktop code path, which is why every defect above survived nine review rounds. The suite carries its own negative control, so a filter bug cannot make it pass vacuously.

  **Size ceilings raised, approved by the repo owner:** core IIFE 17.4 → 17.65 KB, ESM 17.05 → 17.3 KB (linux CI actuals 17.60 / 17.24; a local macOS build measures ~20 B under). A deliberate correctness-for-bytes trade under the ratchet policy in `docs/wiki/build-and-release.md`, on top of the release's own +2.43 KB: **+230 B** is what it costs for the input-ownership contract to hold on the devices this release claims to support, and to stop a sandboxed iframe killing the widget outright. Re-ratcheted razor-thin over actuals as the policy requires.

- 85b6c2e: Mobile touch fixes: pin gestures no longer fight iOS text selection, and the marquee reaches touch via hold-then-drag.

  **Selection and callout suppression.** On iOS every browser is WebKit, and a long-press starts text selection plus the Copy/Search callout on the same gesture pinflow uses to place a pin — a pin landed while the selection handles and callout bar came up with it, and the widget's own popup labels were selectable. Two layers fix it: the shadow UI is now unselectable chrome end to end (the draft textarea keeps selection — it is the one editable surface), and a document-level selection guard (constructed sheet, CSP-safe, `<style>` fallback) suppresses host selection and the callout while annotate mode is armed and for the duration of any stealth touch/pen press. The guard is modal and reversible — same category as the armed crosshair cursor — and never crosses into the shadow tree.

  **Hold-then-drag touch marquee.** An immediate touch drag stays a native scroll — the platform decides ownership at gesture start, and pinflow never takes scrolling. But a finger that holds through the long-press threshold proves no scroll is in flight, so the hold now CLAIMS the gesture: the page dims around a zero-size marquee (the "you have it" cue), a non-passive `touchmove` keeps the scroller locked out, and the release disambiguates exactly like desktop Alt — release in place and it is a point pin, drag first and the drawn region commits as an area comment with `anchor.areaPercent`. Escape (hardware keyboards) and `pointercancel` abort cleanly, and every guarantee of the input-ownership pass carries over: the compatibility click and mouse burst after a touch gesture never reach the host.

  One behavioural consequence: with the marquee available, a touch long-press opens the draft at RELEASE rather than at the hold threshold (the claim still beats the ~500 ms platform recognizer — same race, same winner, different prize). Without area callbacks configured, timer-fire activation is unchanged.

  Size: the guard and the touch grammar cost ~290 B gz; core ceilings move to IIFE 17.95 KB / ESM 17.6 KB, razor-thin over linux CI actuals per the budget policy.

## 0.5.0

### Minor Changes

- 28ae387: Direct-manipulation annotation: hover outline, drag-to-marquee areas, one-dock chrome, and a unified Alt gesture grammar. The bottom-right control and the reviewer menu panel are gone.

  **One bottom-left dock.** The bottom-right control pill is removed. A single dock (bottom-left) holds the whole standing interface: an **arm segment** (`+` arms annotate mode, `×` stops; accent while armed) and the **count chip** (opens the export sheet; appears once comments exist). Builder mode's chip always exists and toggles the drawer. Stealth mode stays chromeless (chip only, when comments exist).

  **Element footprints & canonical preview.** Element-anchored (click-placed) comments also footprint the CAPTURED element's bounds with the same marching ants — clicking a card shows exactly what got selected, retroactively for existing comments (render-derived, no schema change). Degenerate anchors (near-viewport boxes like `<body>`) show no footprint. And the armed hover outline now previews the CANONICAL anchor target (the nearest `data-testid` ancestor — what a click will actually store), so preview = capture = footprint.

  **Hover outline.** While armed, the element under the cursor is highlighted with a non-interactive accent outline (2px `--pf-accent` border + faint accent wash) rendered inside pinflow's shadow root — host element styles/classes are never touched. Skips pinflow's own UI, disappears on disarm/pin placement/Escape, drops its transition under `prefers-reduced-motion`.

  **Drag-to-marquee (area feedback).** While armed: click = point pin, drag past 10px = marquee. The page dims around the drawn box (single `box-shadow` spread — no overlay element). Release resolves the tightest element containing the rect and places a normal element-anchored comment (pin straddling the footprint's top-left corner) carrying the new optional `anchor.areaPercent` `{x,y,w,h}` (percentages of that element). Persistence, healing, orphan handling, and rendering are identical to point comments; exports gain a numbers-only `**Area:**` line. Mouse/pen only — touch drags stay native scrolls. The drag's trailing click is swallowed once so host handlers never see it.

  **Area footprints (marching ants).** Every placed area comment keeps a light, persistent footprint of its drawn region on the page: four 1px marching-ant edges plus a faint accent wash, with the numbered pin STRADDLING the region's top-left corner (Figma-style — the region's content stays unoccluded and clickable; `positionPercent` still records the drawn center as provenance). `pointer-events: none` — the host page is never occluded interactively. Footprints ride the same cached-anchor reflow path as pins (zero new listeners), mute with dispositioned comments, hide with orphans and heal with them, render in builder mode, and freeze under `prefers-reduced-motion`.

  **Armed input ownership (release-review hardening).** While armed, accepted mouse/pen presses are owned END-TO-END at window capture: host handlers never see the pointerdown/pointerup phases or the trailing click (touch and pinflow's own dock stay native). Escape during a held press keeps a shield until that pointer's own release; lost releases (outside-window) recover on the same pointer's next press in both the armed and Alt state machines. `AreaPercent` is exported from the package root.

  **Non-forgeable export workflow fields (independent-review closeout).** The composite comment heading (`### [id] Comment N — createdAt — done`) is replaced by a neutral `### Comment N` plus line-anchored `**Comment ID:**`, `**Status:**` (always present — `open`/`done`/`declined`, derived only from the validated status value), `**Reviewer:**` (builder export), and `**Created:**` fields. Untrusted id/createdAt strings shaped like a disposition can no longer make an agent skip open work. All four shipped agent formats teach the new grammar and now uniformly carry the fixed-string search rule (`-F`, value as its own argv element after `--`). If you parse the artifact yourself, update your heading matcher.

  **Selector healing hardening (independent-review closeout).** An empty candidate fingerprint no longer corroborates a meaningful stored one (recycled/still-loading rows can't win through stale positions); hidden zero-box elements can no longer be accepted — or persisted — as healed anchors (a visible duplicate or an honest orphan wins); hydrated fingerprints are capped to the 80-char representation at both the hydration and matcher boundaries before any O(length) work; and heal-time text extraction streams text nodes in 2 KB chunks against the shared 2 ms deadline instead of materialising whole subtrees via `textContent`.

  **Alt gesture grammar (no arming needed).** Alt+click = point pin, Alt+drag = marquee area, long-press = touch point — one grammar, disambiguated by the 10px threshold. Behavior change: Alt+click now activates on **release** (was: on press) so a drag can be told apart; Alt with a non-primary mouse button is ignored (right-click stays the host's).

  **Reviewer menu panel removed.** Consequences:
  - "Stop" / "Add comment" buttons: gone — click the arm segment or press Escape to disarm.
  - "Clear all" (wipe without export): gone — use the sheet's "Export & clear".
  - "Send to builder" (`onSubmit`): moved to the export sheet. Hosts pairing `onSubmit` with `source` should set `exportUi: 'always'` so the chip/sheet exists.
  - Export & share: unchanged, via the count chip's sheet (or ⌘/Ctrl+Shift+E).

  All armed-mode listeners attach on arm and detach on exit; gesture listeners stay press-scoped — zero move-handler work at rest.

  **Size (the honest full-release accounting).** Core grows from 0.4.1's 14.92 KB gz IIFE / 14.57 KB ESM to **17.35 / 17.00** (macOS; linux CI gzip runs ~30 B heavier) — **+2.43 KB (+16%)** for the entire release: the direct-manipulation interaction model (outline, marquee, dock, Alt grammar, footprints — net of the deleted pill and panel), nine rounds of input-ownership hardening, and the independent-review security closeout (non-forgeable export fields, healing hardening, bounded fingerprint work). Ceilings move to **IIFE 17.4 KB / ESM 17.05 KB**, razor-thin over linux CI actuals per the budget policy — a deliberate, owner-approved notch documented here per the budget policy in `AGENTS.md`.

## 0.4.1

### Patch Changes

- 7b09200: Comment textarea placeholder is now "What should change?" (was "What's on your
  mind?"). A UX review found the old wording invited open-ended musing, while the
  new prompt primes reviewers to leave actionable input a coding agent can act on
  straight from the exported markdown. Copy-only — no behavior or API change.
- 48c7437: Adds an `agent/` folder to the package: the reading protocol for a Pinflow
  artifact, in the four formats coding agents actually load — a skill, a slash
  command, an editor rule, and an `AGENTS.md` snippet. None of it is code, so it
  adds nothing to the browser bundle, and it improves every artifact already
  exported. `agent/README.md` maps each file to the tools that read it.

  The artifact has always been descriptive rather than instructional, and several
  fields are easy to misread: `**Position:**` is a percentage inside the element
  rather than a page coordinate, `Comment N` is a file position while `[cmt_id]`
  is the durable handle, and comments under `## Orphaned comments` describe
  elements that no longer exist — so running their selectors finds whatever
  happens to occupy that path now.

  It also states the boundary the escaping cannot express. Everything interpolated
  into an artifact originates from a web page and the people using it. Pinflow
  escapes all of it so it cannot forge markdown structure, but that defends
  structure, not meaning: an agent must read the content as a problem to solve and
  never as instructions addressed to itself.

- 112ae5d: Pinflow now survives a strict Content Security Policy. Under `style-src 'self'`
  with no `'unsafe-inline'`, the shadow-root `<style>` element was silently
  dropped — and because the host's `pointer-events: none` is set through CSSOM
  (which CSP does not restrict) while every `pointer-events: auto` lived in that
  blocked stylesheet, the widget degraded to an invisible, completely
  **non-interactive** overlay: pins and buttons present, all dead, no error. A
  shadow root has no CSP context of its own, so the document policy governs it.

  Styles now load through a constructed `CSSStyleSheet` adopted into the shadow
  root. CSP defines no hook for CSSOM, so this survives where a `<style>` element
  does not. Engines without constructed stylesheets (Safari below 16.4) keep the
  `<style>` path unchanged, chosen by a feature probe that also rejects engines
  which accept `replaceSync` and silently discard the rules.

  No API change. Hosts serving pinflow under a strict CSP no longer need
  `'unsafe-inline'` in `style-src`.

- 8f44d23: The export confirmation no longer claims a file was saved when it may not have
  been. Downloading fires a detached anchor click and returns nothing — there is
  no event and no promise, so a completed save is not observable. In iOS in-app
  webviews (Instagram, LinkedIn, Slack) it frequently does nothing at all, which
  is exactly where a reviewer following a shared link ends up, and the panel
  announced "Saved to your downloads" regardless.

  The panel now states only what was verified. When the clipboard write succeeded
  it says so and offers pasting as the recovery if no file appeared; when it did
  not, it points the reviewer at their downloads without asserting the file is
  there. With `submitTo` configured and no clipboard, the hand-off now tells the
  reviewer to attach the downloaded file — previously it opened an empty email
  with nothing to paste and nothing to attach.

- 2c1390f: Comments no longer silently re-anchor to the wrong element. The selector ladder
  tried the CSS path before the text fingerprint, so on a virtualised list or an
  infinite scroll — where the DOM recycles nodes — a stale `li:nth-of-type(1)`
  kept resolving confidently onto whatever content had scrolled into that slot. A
  pin on "Order #1042" could reattach to "Order #7781" with no sign anything was
  wrong. A positional match that contradicts a strong stored fingerprint is now
  demoted: the text pass gets first refusal, and the positional hit is still used
  if nothing corroborates, so no comment that resolved before stops resolving.

  Two related fixes on the same path. The fingerprint walk started at the document
  root, which meant `<head>` was scored — a page titled "Checkout" would heal a
  pin on a "Checkout" heading to `<title>`, an exact match found first and never
  displaced. The walk now starts at `<body>` and skips tags that can never be a
  pin target, and skipped elements no longer consume the walk budget.

  The walk is also faster and bounded by time as well as count. Fingerprinting
  normalised an element's entire subtree to keep 80 characters, which measured
  97 µs on a 33 kB anchor and 640 µs under 6x CPU throttling; it now scans a
  bounded prefix and falls back to the full string only when whitespace-heavy
  markup makes the prefix insufficient, so fingerprints are unchanged. A 2 ms
  budget complements the 2,000-node cap, which alone was device-dependent —
  roughly 1.5 ms on a laptop but 9.5 ms on a mid-range phone.

## 0.4.0

### Minor Changes

- 1f626bb: Adaptive theming — the widget now matches its host page by default, and
  branding it takes one variable:
  - **Follows the page's scheme, not the OS**: surfaces use `light-dark()`
    defaults and the shadow host carries inline `color-scheme: inherit`, so a
    light-only site gets a light widget even on dark-OS machines (previously an
    OS media query forced dark panels onto light pages), and a page declaring
    `color-scheme: dark` gets a dark widget.
  - **Dark-surface bug fixed**: panel and drawer secondary buttons had
    hardcoded light chrome (`#f8fafc` backgrounds) that turned unreadable on
    dark surfaces — "Export & clear" was invisible on dark-themed hosts. All
    button chrome now derives from `currentColor`; pin/chip rings ride the
    surface token instead of hardcoded white.
  - **One-variable theming**: setting `theme.accent` alone now derives a
    readable `accentContrast` from the accent's luminance (hex accents;
    explicit values always win). And because CSS custom properties inherit
    through shadow DOM, plain page CSS works with no JS config at all:
    `:root { --pf-accent: #your-brand }`.

  Core ceilings notched 14.55/14.2 KB gz (light-dark()/color-mix strings +
  the luminance derivation; measured ~200 B).

### Patch Changes

- 2587a8d: Clicking an existing pin while annotate mode is armed now disarms the mode and closes the menu, matching new-pin placement. Previously the edit popup opened with the crosshair cursor and document capture listener still active — a subsequent outside click could dismiss the popup and place a spurious pin from the same event — and the menu panel stayed open underneath the popup.

## 0.3.0

### Minor Changes

- 2a620c3: The 0.3.0 onboarding release — every item traces to the first external user's
  feedback session:
  - **Activation defaults to `'both'`** (breaking): Alt+click (Windows/Linux:
    Alt; macOS: ⌥) and 500 ms long-press work with zero config, alongside the
    button. Pass `activation: { mode: 'toggle' }` to restore the old default.
  - **Two-step pinning**: the control button itself arms annotate mode (button,
    then page) — the "Add comment" middle step is gone. Placing a pin closes
    the menu; a second control click is a full stop.
  - **Fail-loud boot**: one `console.info` ready line (version, mode,
    activation, comment count) on success; `console.error` before rethrow on
    init failure. Inert paths (SSR, declined identity) stay silent.
  - **Fuzzy re-anchor**: when every exact candidate misses, a Dice-similarity
    pass (≥0.6, same-tag bias) re-attaches lightly reworded elements instead of
    orphaning; successful heals persist rebuilt selectors so the next load
    matches exactly. Unrecognizable content stays an honest orphan.
  - **Orphans hide** instead of floating gray mid-page; the export sheet
    reports "· n unanchored" and heals un-hide.
  - **Reviewer batch controls**: "Clear all" (confirm surface) in the menu and
    "Export & clear" in the sheet; every removal emits its own `onChange`
    delete so synced hosts stay consistent.
  - Hardening found by the new flow: armed clicks on pinflow's own UI are
    guarded via composedPath, and `download()` clicks a detached anchor (an
    attached one re-entered the armed handler and could place a bogus pin).

  The fingerprint fallback walk no longer early-returns on the first exact
  match — it completes its (still 2000-element-capped) scan so containment
  chains resolve to the deepest element. Slightly more work on a last-ditch
  path, traded for never pinning a wrapper.

  Core ceilings notched for the feature set: IIFE 14.3 / ESM 13.95 KB gz
  (features +0.60 KB, review-round hardening ~+0.15 KB; margin covers linux-CI
  gzip drift).

## 0.2.2

### Patch Changes

- Registry-side republish of 0.2.1: the first npm publish landed in npm's
  staged-packages flow and permanently consumed the 0.2.1 version number
  before public release. No code changes versus 0.2.1.

## 0.2.1

### Patch Changes

- ffccd44: Fix nested-target capture: pins now anchor to the nearest `[data-testid]`
  ancestor of the click target. Clicking a label span or icon nested inside an
  anchored control previously recorded `testid: (none)` and fell back to brittle
  css/xpath selectors, defeating host-side test-id contracts. The whole anchor —
  selectors, text fingerprint, context, and `positionPercent` — is now built from
  the anchored ancestor, so re-pinning stays coherent with the recorded rect.
  Empty/whitespace `data-testid` values are skipped, and elements with no
  anchored ancestor behave exactly as before.

## 0.2.0

### Minor Changes

- db26b9e: Published to npm as **`@brijeshp/pinflow`** (the unscoped `pinflow` name is
  taken by an unrelated package). All module specifiers change accordingly:
  - `import { init } from '@brijeshp/pinflow'`
  - `import { Annotator } from '@brijeshp/pinflow/react'` (same for `/vue`)
  - voice stays a lazy internal seam at `@brijeshp/pinflow/voice` — still zero
    bytes for text users
  - CDN: `https://cdn.jsdelivr.net/npm/@brijeshp/pinflow` now serves the IIFE
    directly (new `jsdelivr`/`unpkg` fields)

  Runtime identity is unchanged: storage keys (`pinflow:c:…`), `window.Pinflow`,
  the worklet processor name, export artifact fields, and DOM/css hooks all keep
  the `pinflow` brand — existing stored comments survive the upgrade untouched.

  Vue wrapper budget notched 0.6 → 0.61 KB gz: the scoped import specifier is
  longer; measured cost 4 B.
  Core ceilings notched to 13.48 (IIFE) / 13.14 KB (ESM) gz: the externalized
  `@brijeshp/pinflow/voice` specifier ships verbatim in core (+10 chars), and
  linux CI gzip runs a few bytes over the macOS measurement — CI is the
  enforcing environment, so ceilings are set from CI actuals (13.46 / 13.12).

## 0.1.1

### Patch Changes

- 5a35e4f: Fix exported xpath selectors: the ancestor walk included `<body>` while the
  builder also prepended `/html/body/`, so every artifact's xpath candidate read
  `/html/body/body[1]/…` and resolved to nothing (re-anchoring silently fell back
  to css/fingerprint). Caught by a reviewer artifact from the first live
  anytime-export session.

## 0.1.0

### Minor Changes

- 71b6030: Anytime export: a summonable export affordance in every mode, not just at the end.
  - **Count chip** (reviewer mode): a small circle in the pins' visual vocabulary, bottom-left, appearing once the reviewer has a comment. Tapping it summons an anchored export sheet (`n comments · m screens` + **Export & share**) wired to the standard flow — download + clipboard + the `submitTo` mailto hand-off. Dismissed by chip toggle or a completed outside tap (pinch/scroll never dismisses).
  - **Draft popup action**: `Export all · n` in the comment popup — saves your draft first, then opens the sheet. Frozen (resolved) popups are unaffected.
  - **Hotkey**: `⌘/Ctrl+Shift+E` opens the sheet on desktop.
  - **`exportUi` config** (`'auto' | 'always' | 'never'`, default `'auto'`): on for local-first installs, off automatically when `source` is configured (a synced host owns collation). Builder mode is unchanged — its drawer already exports anytime.

  Core budgets ratcheted for the feature: ESM 12.15 KB, IIFE 12.5 KB (gz); ~0.65 KB actual cost including the review-hardening pass (surface-state tracking, lossless draft handling, anchor fallbacks).

- 9de6211: Razor-thin bundle overhaul: review remediation, build optimization, and pre-1.0 API corrections.

  **Breaking (pre-1.0):**
  - Removed `PinflowConfig.position` (control is fixed bottom-right), `PinflowConfig.hidden` (use `activation: { mode: 'stealth' }`), and `ActivationConfig.longPressMs`.
  - Vue wrapper: `onSubmit` prop renamed to `submitHandler`; `position`/`hidden` props removed.
  - `init()` now throws when `voice.devOnlyToken` is set on a non-local origin (as documented).
  - Stealth mode no longer prompts for a reviewer name at page load — identity defers to first activation.
  - The comment popup now has an explicit **Save** button (plus Cmd/Ctrl+Enter) instead of auto-save; **Escape or clicking outside dismisses** without saving, and dismissing a comment whose saved text is still empty deletes it (no orphan pins from accidental gestures).

  **Fixed:**
  - Microphone is released when capture setup fails partway (e.g. host CSP blocks `blob:` worklets).
  - Default token fetch no longer throws "Illegal invocation" (detached `fetch` receiver).
  - `init()` no longer crashes hosts that block localStorage — falls back to in-memory storage.
  - Deepgram socket close is handled: keepalive cleared, session degrades, open has a 10s timeout; `finalize()` resolves on the `from_finalize` ack instead of a blind 300ms sleep.
  - Deleted comments can no longer be resurrected by a pending debounced save; no storage writes after `destroy()`.
  - Voice degrade-to-text lands on the route where recording started (frozen route).
  - Audio worklet carries the fractional downsample remainder (44.1 kHz hardware no longer produces off-pitch 14.7 kHz audio).
  - Builder mode no longer re-reads localStorage per scroll frame; anchor resolution is cached across reflow frames.
  - Voice comments now persist `confidence` (minimum across finals) and set `edited: true` on hand-corrected transcripts.

  **Added:**
  - `VoiceConfig.getToken` escape hatch (resolution order: `getToken` → `tokenEndpoint` → `devOnlyToken`).
  - **Reconcile-on-load**: after `source` hydration, local comments absent from the server list are re-announced through `onChange` as `add`s, so transient sync failures self-heal on the next visit (idempotent upserts; see PROTOCOL.md).
  - `config.routeKey?: () => string` + `handle.refreshRoute()`: hosts whose screens change without a URL change (wizards, phased experiences) define their own frame key so pins anchor to — and reset per — the host's notion of a screen.
  - `theme` config: nine design tokens (`fontFamily`, `accent`, `accentContrast`, `surface`, `text`, `textMuted`, `danger`, `radius`, `shadow`) applied as `--pf-*` custom properties so the widget can match the host product's look.
  - `onChange` callback: fires after every persisted comment add/update/delete with the fresh store and the change, for hosts that ingest feedback live.
  - **Feedback lifecycle (v3 schema)**: comments carry team-set `status` (`done`/`declined`) + `resolution` note; resolved pins render muted (✓ / struck) with a frozen read-only popup. `config.source` hydrates comments from a host backend at init (merge: `updatedAt`-wins content, server-owns disposition; no `onChange` echo). `PROTOCOL.md` documents the bring-your-own-backend sync contract.
  - **Collation & submission**: `describeRoute` friendly frame labels in exports; element context (accessible name/role + nearest heading, plus a pin-time computed-style snapshot — background/color/font/radius/bg-image — and image `src`, rendered as `**Computed:**`/`**Image:**` lines so agents know WHAT is pinned, not just where) captured per pin and rendered in markdown; comment ids + dispositions in export headings; `exportJSON` (versioned, machine-readable); `submitTo` guided mailto hand-off; `handle.exportMarkdown()/exportJSON()/downloadExport()` for host-placed submission moments.

  **Bundle sizes (gzipped):** core ESM 12.8 → 9.4 KB, react wrapper 12.9 KB → 313 B, vue wrapper 13.0 KB → 496 B, voice 5.1 → 4.1 KB. ESM/CJS output is now minified; react/vue wrappers resolve the published `pinflow` core instead of bundling their own copy (fixes duplicate-singleton hazard; keep `pinflow` and wrapper versions in lockstep). Size budgets ratcheted to 11/10.5/4.5/1/1 KB.

### Patch Changes

- eb849fc: iOS: stop Safari auto-zoom when the draft popup opens (textarea is 16px on coarse pointers), and stop pinch/scroll gestures from discarding the draft — outside-dismiss now requires a completed single-finger tap (pointerdown + matching pointerup; a second finger or pointercancel aborts).
- 9825570: Production audit hardening (34-finding external review, all resolved):
  - **Export escaping covers every interpolated field** — reviewer names, routes, ids, selectors, resolutions, context, `describeRoute` labels, and bare `\r` are neutralized, not just comment text. Locked by hostile-input tests.
  - **Lifecycle correctness**: source hydration survives SPA navigation; a mid-edit hydration that resolves a comment discards the stale edit; async `onChange`/`onSubmit` rejections are contained; late clipboard results can't resurrect stale panels; nested scroll containers reposition pins; initially-orphaned pins heal (bounded retry) when their element mounts late.
  - **Voice**: startup is abortable (no socket or mic for a torn-down instance); stop/dispose races persist transcripts exactly once; a mid-recording provider error salvages the transcript and releases the mic; the worklet flushes partial buffers on stop and no longer attenuates amplitude at fractional sample-rate ratios.
  - **Storage**: write-probe acquisition (Safari-private read-only stores get the memory shim up front); URI-encoded key components (colon-bearing names cannot alias another namespace) with legacy read fallback; deep numeric anchor validation.
  - **Wrappers**: React function props (`onChange`, `onSubmit`, `source`, `routeKey`, `describeRoute`) delegate to the latest render — no stale closures; `PinflowTheme` exported from the root.
  - **Builder mode is functional**: reviewer checkboxes filter pins; pins open a read-only view with attribution and disposition.
  - **A11y/platform**: pins are real buttons with accessible names; `prefers-reduced-motion` honored; `.root` font stack survives `all:initial` quirks; the export hotkey leaves the chord to the host when pinflow won't act.
  - **Public API**: `routeOf` now strips pinflow params exactly like the default route key (documented behavior).

  Budgets re-ratcheted to the audited actuals: core ESM 13.1 KB, IIFE 13.45 KB, voice 4.45 KB, react wrapper 0.47 KB (gz) — the measured cost of the correctness work above across both certification rounds.

- dbf5496: Vue wrapper: forward the full `PinflowConfig` to `init()`. The `<Annotator>` component previously declared an enumerated props subset, silently dropping `theme`, `source`, `onChange`, `routeKey`, `describeRoute`, and `submitTo` for Vue consumers. All config keys now pass through; `onChange` maps from a new `changeHandler` prop (same rename convention as `submitHandler`, since Vue reserves `on*`-prefixed props for `v-on` listeners). `theme` and `submitTo` are snapshotted at init like the other object props.

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository scaffolding: TypeScript, tsup build (ESM + CJS + IIFE), Vitest, Playwright, Prettier, Changesets, size-limit CI gate at 30KB gzipped.
- v1 spec under `specs/pinflow_v1_spec.md`.
