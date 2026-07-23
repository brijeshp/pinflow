---
title: 'feat: Anytime export — summonable artifact affordance in every mode'
type: feat
status: active
date: 2026-07-23
---

# ✨ Anytime export — summonable artifact affordance in every mode

## Overview

Reviewers should be able to produce the markdown artifact at any moment of a session, not only at a terminal "export moment." Today that's true in exactly one of pinflow's three surfaces. This plan closes the gap with a **summon, don't station** design: no new persistent chrome parked over the host prototype, but an export surface reachable within one gesture from anywhere, on any input device, in any activation mode.

## Problem statement

Verified current state (`src/core/ui/annotator.ts`):

| Surface                | Export today                                                                                                                                             | Gap                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Toggle mode (reviewer) | ✅ anytime — control button → panel → "Export & share" (`_handleReviewerExport`: download + clipboard + confirmation, `submitTo` mailto when configured) | none                  |
| Builder mode           | ✅ anytime — persistent drawer                                                                                                                           | none                  |
| **Stealth mode**       | ❌ **nothing** — zero chrome by design; export exists only if the host calls `handle.exportMarkdown()/downloadExport()`                                  | **the whole problem** |

Stealth is not a corner case: it's the sensavera embed, it's mobile, and it's the mode the README leads with. A reviewer 15 pins into a stealth session who wants to hand off _now_ has no path. That's the "export only at the end" feeling — in stealth there isn't even an end, just whatever moment the host chose to wire up (or didn't).

Two constraints make this interesting:

1. **Stealth's identity is zero visual footprint.** The library's promise is that the prototype under review stays untouched — pins appear only where the reviewer put them. Any always-on chrome spends that promise.
2. **Size budgets are razor-thin by policy**: core ESM 11.49/11.5 KB gz (10 bytes of headroom), IIFE 11.82/11.85. Any UI addition requires a deliberate, changeset-documented budget notch — there is no "sneak it in."

## Design exploration (impeccable critique applied)

Register: **product** — this UI serves the host's prototype; it must never compete with it. Scene sentence for the theme/shape decision: _a reviewer on their phone, mid-scroll through someone else's prototype, decides their six comments are enough and wants the file in the builder's hands before their train stop._ That sentence kills half the option space by itself: whatever we build must be reachable one-handed, on touch, without prior knowledge of a shortcut.

### Option A — Hotkey reveals an export button (thought-starter 1)

`⌘/Ctrl+Shift+E` summons a small export surface.

- **For:** truly zero footprint; consistent with stealth's Alt+click culture (power-user chord vocabulary); cheap (~100–150 B).
- **Against:** invisible affordances are undiscoverable — a hotkey no one knows about is functionally identical to no feature. Fatal: **mobile has no keyboard.** The train-stop reviewer is untouched by this option. Hotkeys can only ever be an accelerator, not the affordance.

### Option B — Persistent mini-drawer after first comment (thought-starter 2)

A small always-there drawer once ≥1 comment exists.

- **For:** discoverable, mobile-parity, matches "after the first comment" intuition.
- **Against:** violates stealth's core identity — a stationed panel over someone else's prototype is exactly what stealth exists to avoid. It occludes content (possibly the very element being reviewed), pollutes screenshots (reviewers screenshot prototypes constantly), and duplicates the toggle-mode control's job with a second piece of standing furniture. Impeccable's law applies: a drawer here is the card-grid reflex — the lazy first answer.

### Option C — Pin context menu (long-press / right-click a pin → export)

- **Against:** hidden two-levels deep, collides with the pin's existing tap = open-editor gesture, fiddly on touch, and menus are modal-adjacent. Rejected outright.

### Option D — Summonable count chip + export sheet ("summon, don't station") — **recommended**

A **count chip**: one small circle in the pin's exact visual vocabulary (same size/token/pop animation as `.pin`, showing the session's comment count), anchored bottom-left, that exists **only when the reviewer has ≥1 comment** — the user's "after the first comment" rule, kept. Tapping it summons a small anchored **sheet** (the existing `_makePanel` scaffolding — deliberately _not_ a modal) with:

- **Export** (primary) → the existing `_handleReviewerExport()` path: download + clipboard + confirmation, `submitTo` mailto hand-off when configured.
- Comment count + "n screens" line (orientation, not decoration — it answers "did it get everything?").
- Dismiss by outside tap, using the popup's existing completed-tap semantics (pinch/scroll never dismisses — the hard-won iOS behavior carries over for free).

Why the chip passes the stealth-identity test the drawer fails: **it is made of the same material as the pins.** A reviewer who has placed pins already accepts numbered teal circles as "my annotations, not the app." The chip reads as the _sum_ of those circles, not as new chrome. It also does double duty as the answer to "am I (still) in feedback mode?" — a real ambiguity in stealth today. It appears via the existing `pop` keyframe when the first comment lands and unmounts at zero comments.

What keeps it honest (impeccable bans consulted): not a FAB with an icon glyph (it's the pin circle with a number — no new visual language); no modal (anchored sheet, existing panel styles); no new colors (`--pf-accent` family); copy is two words ("Export", "Done" — reusing existing strings where possible).

### The layered recommendation

| Layer | Surface                                                                                                                                             | Who it serves                                                                      | Mode gating                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1     | **Count chip → export sheet**                                                                                                                       | everyone, especially mobile stealth                                                | stealth + toggle (toggle keeps its panel too; chip is consistent across modes) |
| 2     | **Draft-popup tertiary action** — a quiet "Export all · n" text link in the popup actions row (saves the current draft first, then opens the sheet) | the reviewer already mid-comment; costs ~1 line of layout in an existing container | same gate as chip                                                              |
| 3     | **Hotkey `⌘/Ctrl+Shift+E`** → opens the same sheet (never silently downloads — an invisible trigger deserves a visible response)                    | desktop power users; the accelerator Option A wanted to be                         | desktop only, chord (no bare-key capture, so no host-input guard complexity)   |

### The gate: `exportUi` config (the part that keeps hosts safe)

New `PinflowConfig.exportUi?: 'auto' | 'always' | 'never'`, default `'auto'`:

- `'auto'` → **ON for local-first installs** (no sync hooks), **OFF when `source` is configured** (a synced host owns collation — its builders export from their dashboard, and members handing a mailto artifact to nobody is noise). Presence of `source` (not `onChange`) is the discriminator: `source` means "a backend serves this corpus back," which is precisely when member-side export is redundant.
- `'always'` / `'never'` → explicit host override in either direction.

Consequence checked against the live host: **sensavera configures `source` → chip/link/hotkey default OFF → zero member-visible change, zero host code, no FE release required.** The OSS/self-serve audience — the people for whom the artifact IS the product — get the affordance by default.

## System-wide impact

- **Size budgets (the hard one):** estimate ~0.45–0.7 KB gz across chip + sheet reuse + gating + hotkey (sheet reuses `_makePanel`/`.panel`; chip reuses `.pin` styles with a variant class). Requires a deliberate one-notch budget raise, then re-ratchet to actuals after byte-golf — the exact precedent of the lifecycle features (raise `953047d`, golf `9906127`, re-ratchet `c4ef4e6`). Ceiling proposal: ESM 11.5 → 12.1, IIFE 11.85 → 12.5, both re-ratcheted post-implementation. Budget line is an acceptance criterion, not an afterthought.
- **Interaction graph:** chip tap → sheet → `_handleReviewerExport()` → `download()` + `copyToClipboard()` → `_showConfirmation()` (submitTo mailto). No new export logic — one new entry point into an existing, tested path. Chip visibility subscribes to the same store mutations that drive `_renderPins()` (`_persist` sites); route changes do NOT hide it (the artifact is whole-session, so the count is total, not per-frame).
- **Dismissal/state lifecycle:** chip and sheet live inside the shadow root; sheet dismissal reuses the completed-tap outside-dismiss machinery. Open draft + chip tap = ordinary outside tap (existing semantics: empty draft deleted, typed draft… dismissed-and-discarded — which is why Layer 2's popup link _saves first_; the chip is not reachable "through" an open popup without an outside tap, making the order deterministic). Export during an in-flight voice recording exports committed comments only (transcript commits on stop — documented, not "fixed").
- **API surface parity:** `exportUi` lands in `types.ts` + both wrappers pass it through untouched (config passthrough — no wrapper code change, verify with existing wrapper tests). `Handle` methods unchanged. Builder mode unchanged (drawer already anytime; unifying builder onto the chip is explicitly out of scope).
- **`_`-mangling:** all new members `_`-prefixed per the minification contract.
- **core↔voice seam:** untouched. No new imports anywhere near `voice-loader`.
- **Docs:** README (stealth section gains the chip + hotkey), `PROTOCOL.md` (one line: synced hosts and the `'auto'` default), wiki `api.md`/`core.md` via the wiki-update playbook, changeset (minor).

## Integration test scenarios (beyond unit tests)

1. Stealth, mobile-shaped viewport: place first comment → chip pops in; tap chip → sheet; Export → artifact downloaded with all routes; delete last comment → chip unmounts.
2. Open typed draft → tap chip: draft dismissed per existing rules, sheet opens, export excludes the discarded draft (assert count).
3. Popup "Export all · n": typed text is SAVED, then sheet opens, export includes it.
4. `source` configured (sensavera simulation): no chip, no popup link, hotkey inert; `exportUi: 'always'` re-enables all three.
5. Hotkey with focus inside the host page vs inside the draft textarea: chord opens sheet in both; never fires on bare keys.
6. Pinch/scroll over the open sheet (iOS semantics): sheet survives; completed outside tap closes it.

## Acceptance criteria

### Functional

- [ ] Stealth mode: export reachable within one gesture at any time once ≥1 comment exists (chip → sheet → Export).
- [ ] Chip appears on first comment, disappears at zero; count = total comments across all frames.
- [ ] Sheet Export runs the existing download + clipboard + confirmation (+ `submitTo`) path.
- [ ] Draft-popup "Export all · n" saves the draft, then opens the sheet.
- [ ] `⌘/Ctrl+Shift+E` opens the sheet (desktop, chord only).
- [ ] `exportUi: 'auto'` disables all three when `source` is configured; `'always'`/`'never'` override both ways.
- [ ] Toggle + builder modes keep their existing surfaces unchanged.

### Non-functional

- [ ] TDD throughout; coverage gate holds (≥80% `src/core/**`).
- [ ] `pnpm size` green under the notched ceilings; final commit re-ratchets to actuals.
- [ ] Chip/sheet fully keyboard-operable + `aria-label` ("Export feedback, N comments"); sheet is `role="dialog"`-free (non-modal anchored surface, focus not trapped).
- [ ] No new colors, no modal, no persistent chrome beyond the chip; chip uses pin visual vocabulary and the existing `pop` animation.
- [ ] Live browser proof on the demo (`pnpm --dir demo`) and against the sensavera-shaped config (auto-off), before declaring done — per the standing lesson: tests then browser, every time.

## Implementation phases

1. **Phase 1 — gate + chip + sheet** (`types.ts`, `annotator.ts`, `styles.ts`; tests: `tests/core/export-ui.test.ts` — gating matrix, chip lifecycle, sheet flow, dismiss semantics).
2. **Phase 2 — popup link + hotkey** (popup actions row; document-level chord listener with generation guard; tests extend `annotator.test.ts` + `export-ui.test.ts`).
3. **Phase 3 — budgets + docs + ship** (byte-golf, re-ratchet, README/PROTOCOL/wiki/changeset, demo showcase toggle, Codex review round, merge per repo flow).

## Alternatives considered and rejected

- **Pure hotkey (A):** mobile-blind, undiscoverable — demoted to accelerator layer.
- **Persistent drawer (B):** stealth-identity violation, occlusion, screenshot pollution — the chip keeps its one good idea (appear after first comment) and discards the furniture.
- **Pin context menu (C):** hidden, gesture-colliding, modal-adjacent.
- **Host-only solution (status quo + docs):** keeps OSS adopters writing boilerplate for the product's core output; the artifact is the product.

## Open questions (non-blocking, defaults chosen)

1. Chip corner: **bottom-left** default (control button owns bottom-right in toggle mode; collision avoided). Worth a demo-page eyeball before locking.
2. Chip copy on hover/long-press (`title`): "Export feedback (⌘⇧E)" — surfaces the hotkey for discoverability.
3. Should `'auto'` also consider `onSubmit`? Current call: no — `onSubmit` hosts still want the reviewer-side moment; only `source` implies a collation backend.

## Sources & references

- Current export flow: `src/core/ui/annotator.ts` (`_renderReviewerPanel`, `_handleReviewerExport`, `_showConfirmation`), `src/core/export.ts`, `src/core/download.ts`.
- Stealth identity + spec: `specs/pinflow_v1_spec.md` §5.6 (export confirmation), README stealth section.
- Budget precedent: commits `953047d` → `9906127` → `c4ef4e6`; policy in `AGENTS.md` + `docs/wiki/build-and-release.md`.
- Host gating context: `PROTOCOL.md` (source/onChange contract); sensavera embed config `FeedbackLayerInner.tsx` (`activation: stealth`, `source` set).
- Impeccable context loader: no PRODUCT.md/DESIGN.md in repo (`hasProduct: false`) — register inferred **product**; shared design laws applied (no modal-first, no FAB cliché, no new chrome vocabulary, copy discipline). Planning-only pass; mutation gates not in play.
