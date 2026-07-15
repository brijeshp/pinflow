---
title: 'feat: Feedback lifecycle — collate, persist, close the loop'
type: feat
status: active
date: 2026-07-06
---

# ✨ Feedback Lifecycle: Collate → Persist → Resolve

## Overview

Pinflow today is excellent at **capture** (pins, voice, per-frame scoping, themed popup). The next evolution is the rest of the lifecycle:

1. **Collate** — turn gathered feedback into a trackable artifact with surgical references: exactly which frame, exactly which element, in the author's words.
2. **Persist** — feedback outlives localStorage.
3. **Close the loop** — the team's disposition ("we did this / we declined this because…") flows back to the person who gave the feedback.

**Prime directive, restated for this phase:** pinflow ships _contracts, formats, and hooks_ — never servers. Every mechanism below is generic; sensavera implements the host side and becomes the public case study. This is what makes pinflow promotable as an independent asset: "zero-backend by default, **bring-your-own-backend by contract** when you outgrow it."

## The core thesis (my recommendation, asked for directly)

**On storage (question 1):** don't build or host storage — make persistence _pluggable and symmetric_. Pinflow already has the write half (`onChange` → the host upserts/deletes by comment id; sensavera's `session_feedback_annotations` table is a working reference implementation). The missing half is **read**: a `source` hook that hydrates comments from the host on init. Once both halves exist, "perpetual storage" is any backend that implements three verbs (list / upsert / delete) over the pinflow comment schema — which we formalize as a versioned, documented **sync protocol**. localStorage remains the zero-config default; the protocol is the growth path. This keeps the library razor-thin and makes every host's backend a durable store without pinflow ever owning data.

**The one assumption to state out loud:** pinflow's `reviewer` is a display label, never authentication. Authorship identity — "which human gave this feedback, and may they see it again" — is entirely host-owned (sensavera: session/shortcode possession). Every scoping rule below builds on that.

**On closing the loop (question 2):** the strongest mechanism is **resolution shown in situ** — the reviewer reopens the prototype and sees their own pins annotated with the team's disposition: a muted ✓ pin for "done," a struck pin for "declined," each with a one-line resolution note in the (read-only) popup. Feedback returns to the exact place it was given, which no email digest can match. Mechanically this is small: the `Comment` model gains `status` + `resolution` (set by the _team_, never the reviewer, delivered through the same hydration path), and pinflow renders it. Out-of-band digests ("here's what happened to your 12 comments") are host territory — sensavera can generate them from the same data; the library just guarantees the data model carries disposition. The collated markdown export doubles as the team-side tracking artifact: every comment block carries its stable id, frame label, element context, and current status — pasteable into a tracker, a PR description, or an AI agent.

## Design principles (library ↔ host boundary)

| Concern                           | Pinflow (library)                         | Host (sensavera)                               |
| --------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Capture                           | ✅ owns                                   | config only                                    |
| Artifact format (markdown + JSON) | ✅ owns, versioned                        | consumes                                       |
| Frame identity                    | `routeKey` seam (done)                    | provides keys + friendly labels                |
| Durable storage                   | sync protocol + `source`/`onChange` hooks | implements list/upsert/delete                  |
| Status/resolution                 | data model + in-situ display              | sets it (review surface), notifies out-of-band |
| Identity/auth                     | never                                     | owns entirely                                  |

## Phase L1 — Pinflow: the artifact (collation)

- [x] **L1.1 Comment model v3**: add `status?: 'open' | 'done' | 'declined'` (absent = open) and `resolution?: string` (team's one-liner, ≤500 chars). Storage `SCHEMA_VERSION` 2→3 with forward-tolerant migration ([storage.ts:4](../../src/core/storage.ts)); wire types are additive so the sensavera BE contract is unbroken.
- [x] **L1.2 Frame labels in exports**: `config.describeRoute?: (key: string) => string` — exports render `## Section 2 — Employment details` with the stable key in backticks beneath. Hosts with `routeKey` almost always have labels; URL-default hosts need nothing.
- [x] **L1.3 Element context enrichment**: capture (at pin time, into `anchor`) the target's accessible name/role and nearest heading text: exports say _“the ‘Continue’ button under ‘Next section’”_ instead of only a CSS path. Bytes-budgeted; extends the existing README privacy warning (captured page text now includes the nearest heading, not just the target's fingerprint).
- [x] **L1.4 Comment ids + status in markdown**: every block leads with `### [c_9f2k…] Comment 3`, with a `— done`/`— declined` suffix only when a disposition exists (backendless v1-style exports stay noise-free).
- [x] **L1.5 JSON export**: `exportJSON(store | stores)` → `{ pinflowExport: 3, comments: [...] }` — version number IS the comment schema version (one namespace). The machine-readable twin of the markdown (markdown for humans/agents, JSON for pipelines). Exposed on the handle and in builder mode. Constraint: export helpers stay DOM-free pure functions — S2.2 runs them server-side in the hub.
- [x] **L1.6 The submission moment** (free-plan hand-off, guided): v1's "Export & share" already downloads + copies to clipboard; make the hand-off active instead of passive:
  - `config.submitTo?: { email: string; subject?: string }` — the post-export confirmation gains an "Email it to the builder" button: opens `mailto:` (subject prefilled) with the instruction "your feedback is copied — paste it into the email." Download + clipboard + mailto = a complete zero-backend submission channel.
  - `handle.exportMarkdown(): string` and `handle.downloadExport(): void` — public API so HOSTS place the submission moment (stealth mode has no chrome, so the host owns the exit ramp: end-of-flow screens, "done reviewing?" banners). A library-injected floating stealth chip was considered and rejected — it breaks stealth's invisibility contract and hosts know their own "finished" moment; revisit only on demand.
  - Free-vs-managed framing (for L3.2's README): free = artifact + guided hand-off, the reviewer carries it; managed = `onChange`/`onSubmit` already streamed it (sensavera never needs the email path — every pin is server-side on save). The future "paid compiler" slots in behind the managed seam.

## Phase L2 — Pinflow: pluggable persistence + the loop UI

- [x] **L2.1 `source` hydration hook**: `config.source?: () => Promise<Comment[]>` — fetched **once at init** (hosts refresh by re-init; no `reload()` API — YAGNI, localStorage makes re-init lossless). **Scope rule:** in reviewer mode, `source` returns only the current reviewer's comments — the host authenticates that however it likes; pinflow never enforces identity. All-reviewer hydration for builder mode is explicitly a later slice. Merge by comment id: `updatedAt`-wins for content, **server always wins for `status`/`resolution`** (the team sets disposition; a reviewer's device can never overwrite it). Failure = silent fallback to localStorage (same posture as `onChange`).
- [x] **L2.2 Sync protocol doc** (`PROTOCOL.md`): formalize what already exists — the comment JSON schema (versioned; same version namespace as the storage schema, so "v3" means one thing everywhere), the three verbs (list → `source`, upsert/delete → `onChange`), idempotency rules, **scope rules** (list is per-reviewer in reviewer mode; disposition fields are server-owned), and the privacy expectations. Sensavera's endpoints become the named reference implementation. This document _is_ the promotable "bring your own backend" story.
- [x] **L2.3 Resolution UI**: `done` pins render muted with a check glyph; `declined` muted/struck; popup for a resolved comment shows the resolution note read-only above the text. Resolved comments are **fully frozen — no edit, no delete**: once the team dispositions a comment it's a shared record, not the reviewer's draft. Theme tokens cover the styling (muted = textMuted).
- [x] **L2.4 Budget check**: L1+L2 must fit existing budgets (est. +600–900 B gz core). The grep guards and wrapper budgets stay.

## Phase L3 — Pinflow: publishable independent asset

- [ ] **L3.1 Publish 0.1.0 to npm** (changeset ready) — **needs your call on the npm org/name + git remote** (currently no remote; the repo can't be public-promoted without one).
- [x] **L3.2 README repositioning**: lead with the lifecycle (capture → export → sync → resolve), the sync protocol, and "sensavera runs this in production" as the case study; refresh the demo site with frame-scoping + Save UX + resolution states.
- [x] **L3.3 Known polish**: voice HUD should consume surface/text/font tokens (standing gap from the sensavera integration).

## Phase S1 — Sensavera BE (contract-note asks; backend is BE-owned)

- [ ] **S1.1** `status`/`resolution`/`resolved_at`/`resolved_by` columns on `session_feedback_annotations`; status enum mirrors the library.
- [ ] **S1.2** `GET /v1/sessions/{id}/feedback-annotations` (member-facing, flag-gated) → pinflow `source` shape; server strips nothing (status/resolution included — that IS the loop).
- [ ] **S1.3** Hub/dashboard endpoints: list annotations by campaign/deployment/session with filters; `PATCH …/annotations/{comment_id}` to set status+resolution.

## Phase S2 — Sensavera Hub: the review surface (where "trackable" lives)

- [ ] **S2.1** Feedback tab on campaign/deployment: annotations grouped by session → frame (using the same `deriveFeedbackFrameKey` labels), with text/voice badge, reviewer/session attribution, and status controls (Done/Declined + note).
- [ ] **S2.2** Collated export button → pinflow-format markdown across sessions (the "send it to the team" artifact with exact frame + element + id + status) — generated from the BE data using pinflow's export helpers (library import in hub, tree-shaken to the export functions: proves the library composes server-side/tooling-side too).
- [ ] **S2.3** (Later, optional) per-reviewer digest: "of your 12 comments — 7 done, 2 declined (with reasons), 3 open" — generated from the same table; delivery channel (email/link) is a product decision, not this plan's.

## Phase S3 — Sensavera FE: hydration + the reviewer's return visit

- [ ] **S3.1** `source` wired to S1.2; returning reviewers (same session URL/shortcode) see their pins + statuses on the right frames, even on a new device.
- [ ] **S3.2** `describeRoute` wired to friendly frame names (extend `feedbackFrameKey.ts` with a label map from section/node titles).
- [ ] **S3.3** Flagged-session end-to-end proof finally closes here too (voice mint 200 + annotation 204 + hydration round-trip) — still gated on a feedback-enabled deployment existing on sandbox.

## Deliberately NOT in this plan

- Screenshot capture (stays deferred: zero-deps, privacy, and anchors+context are the AI-agent-native answer).
- Threading/replies, assignees, severity (v1 spec deferral stands; status+resolution is the minimum loop).
- A hosted pinflow backend/SaaS (violates the ethos that IS the pitch; revisit only if the paid-compiler idea matures).
- In-library notifications (host territory, always).

## Acceptance criteria

- [ ] A v2 localStorage store loads unchanged under schema v3; a v3 store round-trips status/resolution.
- [ ] With `source` + `onChange` wired to a conformant backend: pin on device A → appears on device B for the same reviewer; team sets `done` + note → reviewer's pin renders resolved, frozen, with the note visible.
- [ ] A reviewer can never alter or delete a dispositioned comment, and a device can never overwrite server-set `status`/`resolution`.
- [ ] Collated markdown for a multi-frame, multi-reviewer corpus shows: friendly frame headings (`describeRoute`), element context lines, stable ids, dispositions — and `exportJSON` emits the same corpus machine-readably.
- [ ] A reviewer on a backendless (free) install can finish with feedback in the builder's inbox using only pinflow UI: export → download + clipboard → prefilled mailto — no typing an address, no hunting for the file.
- [ ] All existing guards hold: size budgets, voice-isolation grep, wrapper isolation, 0-byte cost when features are unconfigured.

## Sequencing & risks

- L1 → L2 → S1-asks (contract note can go out after L1 fixes the schema) → S2/S3 in parallel with L3. Library phases are each PR-sized; the review-loop discipline (codex rounds, ledger) continues on the sensavera side.
- Risk: schema v3 migration must keep v2 stores readable (forward-tolerant `migrate()` pattern already exists).
- Risk: `source` merge semantics are the one genuinely subtle design (id-match, updatedAt-wins for content, server-wins for disposition); TDD it hard.
- Decision needed from you: npm org/name + git remote for L3.1 (blocking only that item).

## Sources

- This session: bundle-optimization plan (completed), sensavera embedding plan (Phases A–C shipped to sandbox), frame-key + Save-UX evolution (shipped), BE contract notes + sensavera `session_feedback_annotations` reference implementation.
- Anchors: [export.ts](../../src/core/export.ts), [storage.ts](../../src/core/storage.ts) (SCHEMA_VERSION), [types.ts](../../src/core/types.ts) (Comment/PinflowConfig), ShareVoice `sensavera-frontend/lib/session/feedbackFrameKey.ts`, `sensavera-backend/app/services/experience/feedback.py`.
- v1 spec §12 deferrals (respected), CONTRIBUTING.md invariants (zero deps, 30 KB ceiling, no telemetry).
