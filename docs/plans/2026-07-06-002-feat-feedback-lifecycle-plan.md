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

- [ ] **L1.1 Comment model v3**: add `status?: 'open' | 'done' | 'declined'` (absent = open) and `resolution?: string` (team's one-liner, ≤500 chars). Storage `SCHEMA_VERSION` 2→3 with forward-tolerant migration ([storage.ts:4](../../src/core/storage.ts)); wire types are additive so the sensavera BE contract is unbroken.
- [ ] **L1.2 Frame labels in exports**: `config.describeRoute?: (key: string) => string` — exports render `## Section 2 — Employment details` with the stable key in backticks beneath. Hosts with `routeKey` almost always have labels; URL-default hosts need nothing.
- [ ] **L1.3 Element context enrichment**: capture (at pin time, into `anchor`) the target's accessible name/role and nearest heading text (~2 lines of capture code, big legibility win): exports say _“the ‘Continue’ button under ‘Next section’”_ instead of only a CSS path. Bytes-budgeted; fingerprint already exists.
- [ ] **L1.4 Comment ids + status in markdown**: every block leads with `### [c_9f2k…] Comment 3 — open` so trackers/agents/humans can reference and round-trip a specific comment.
- [ ] **L1.5 JSON export**: `exportJSON(store | stores)` → versioned `{ pinflowExport: 3, comments: [...] }` — the machine-readable twin of the markdown (markdown for humans/agents, JSON for pipelines). Exposed on the handle and in builder mode.

## Phase L2 — Pinflow: pluggable persistence + the loop UI

- [ ] **L2.1 `source` hydration hook**: `config.source?: () => Promise<Comment[]>` — fetched once at init (and on `refreshRoute`? no — once, plus an explicit `handle.reload()`), merged into the local store by comment id with `updatedAt`-wins semantics, EXCEPT `status`/`resolution` which the server always wins (the team sets them; the reviewer's device can't). Failure = silent fallback to localStorage (same posture as `onChange`).
- [ ] **L2.2 Sync protocol doc** (`PROTOCOL.md`): formalize what already exists — the comment JSON schema, the three verbs (list → `source`, upsert/delete → `onChange`), idempotency rules, and the status ownership rule. Sensavera's endpoints become the named reference implementation. This document _is_ the promotable "bring your own backend" story.
- [ ] **L2.3 Resolution UI**: `done` pins render muted with a check glyph; `declined` muted/struck; popup for a resolved comment shows the resolution note read-only above the (still-editable? **no — frozen**) text. Reviewer edits to resolved comments are blocked with the note visible — the conversation happened; don't fork it. Theme tokens cover the styling (muted = textMuted).
- [ ] **L2.4 Budget check**: L1+L2 must fit existing budgets (est. +600–900 B gz core). The grep guards and wrapper budgets stay.

## Phase L3 — Pinflow: publishable independent asset

- [ ] **L3.1 Publish 0.1.0 to npm** (changeset ready) — **needs your call on the npm org/name + git remote** (currently no remote; the repo can't be public-promoted without one).
- [ ] **L3.2 README repositioning**: lead with the lifecycle (capture → export → sync → resolve), the sync protocol, and "sensavera runs this in production" as the case study; refresh the demo site with frame-scoping + Save UX + resolution states.
- [ ] **L3.3 Known polish**: voice HUD should consume surface/text/font tokens (standing gap from the sensavera integration).

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

## Sequencing & risks

- L1 → L2 → S1-asks (contract note can go out after L1 fixes the schema) → S2/S3 in parallel with L3. Library phases are each PR-sized; the review-loop discipline (codex rounds, ledger) continues on the sensavera side.
- Risk: schema v3 migration must keep v2 stores readable (forward-tolerant `migrate()` pattern already exists).
- Risk: `source` merge semantics are the one genuinely subtle design (id-match, updatedAt-wins for content, server-wins for disposition); TDD it hard.
- Decision needed from you: npm org/name + git remote for L3.1 (blocking only that item).

## Sources

- This session: bundle-optimization plan (completed), sensavera embedding plan (Phases A–C shipped to sandbox), frame-key + Save-UX evolution (shipped), BE contract notes + sensavera `session_feedback_annotations` reference implementation.
- Anchors: [export.ts](../../src/core/export.ts), [storage.ts](../../src/core/storage.ts) (SCHEMA_VERSION), [types.ts](../../src/core/types.ts) (Comment/PinflowConfig), ShareVoice `sensavera-frontend/lib/session/feedbackFrameKey.ts`, `sensavera-backend/app/services/experience/feedback.py`.
- v1 spec §12 deferrals (respected), CONTRIBUTING.md invariants (zero deps, 30 KB ceiling, no telemetry).
