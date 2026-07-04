---
title: 'feat: Sensavera feedback mode — pinflow embedding (first real-world host)'
type: feat
status: active
date: 2026-07-04
---

# ✨ Sensavera Feedback Mode: Embedding Pinflow as a Third-Party Library

## Overview

Embed pinflow into the ShareVoice product so a reviewer can experience a sensagram in **feedback mode**: long-press (mobile) or Alt+click (desktop) drops a pin anywhere on the experience, with text or voice (Deepgram) feedback, in a popup that visually harmonizes with sensavera's in-line experience. Enablement is deployed from the hub at the deployment or individual private-launch (shortcode) level.

This is pinflow's first real-world host. **The prime directive: every pinflow change stays 100% generic** — anything sensavera-shaped lives in the ShareVoice repos.

## Alignment Verdict (the question asked)

| Ask                                                            | Verdict                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lazy-load only in feedback mode; keep sensavera-frontend tight | ✅ Native fit. `next/dynamic` precedent exists ([SessionClient.tsx:70-76](/Users/brijeshpatel/Apps/ShareVoice/sensavera-frontend/app/s/%5BcampaignId%5D/session/%5BsessionId%5D/SessionClient.tsx)); pinflow = 0 bytes off, ~9.5 KB gz on, voice +4 KB only at first recording. |
| Hub enablement at session/shortcode level                      | ✅ Pure host-side. Pinflow keeps its "no entitlement logic" invariant — it just gets init'd or not.                                                                                                                                                                             |
| Long-press / mouse → pin, incl. voice                          | ✅ Already built: `activation: { mode: 'stealth' }`, `voice.getToken`, `reviewer` config (no name prompt).                                                                                                                                                                      |
| Popup resembles the in-line experience                         | ⚠️ **Needs one generic addition**: a theming-token API. Baking sensavera UI into pinflow would break the library. Tokens get "resembles gracefully"; pixel-identical would need a headless mode (deferred, v3, also generic).                                                   |
| Live feedback into sensavera backend                           | ⚠️ **Needs one generic addition**: an `onChange` comment-event callback (today only `onSubmit` on explicit export exists).                                                                                                                                                      |

**Two deliberate architectural differences (not conflicts):** (1) sensavera's own voice streams PCM to its backend over WS; pinflow streams browser→Deepgram with a short-lived grant token — feedback voice stays fully independent of the sensagram recording pipeline. (2) sensavera holds a session-long shared mic stream ([mic-stream.ts](/Users/brijeshpatel/Apps/ShareVoice/sensavera-frontend/lib/mic-stream.ts)); pinflow acquires its own — concurrency is host-gated (see Phase C), pinflow stays ignorant.

## Phase A — Pinflow: generic API additions (this repo)

- [ ] **A1. `theme` config (design tokens)** — `PinflowConfig.theme?: PinflowTheme` with a minimal token set: `fontFamily`, `accent`, `accentContrast`, `surface`, `text`, `textMuted`, `danger`, `radius`, `shadow`. Implementation: rewrite `src/core/ui/styles.ts` values as `var(--pf-accent,#111)`-style fallbacks (CSS already ships — near-zero byte cost) and set the custom properties on the shadow host from config at init. Defaults = current look. Voice dot (`src/voice/ui/dot.ts`) reads the same tokens (`danger` = recording). Tests: tokens applied to host style; absent theme = unchanged CSS.
- [ ] **A2. `onChange` callback** — `PinflowConfig.onChange?: (store: ReviewerStore, change: { type: 'add' | 'update' | 'delete'; comment: Comment }) => void`. Fired after each persisted mutation (piggyback on `_persist()`); host owns debouncing/batching/network. Never throws into pinflow (wrap in try/catch + logger warn). Tests: fires on add/edit/delete with correct change payload; exceptions contained.
- [ ] **A3. Release mechanics** — pinflow is not on npm and has no git remote. Sensavera can't consume it until it's published (or `file:`/workspace-linked for dev). Decide: publish `0.1.0` (changeset is ready) or link locally for the spike. **Blocking prerequisite for Phase C.**
- [ ] Budget check: A1+A2 must fit inside the 10.5/11 KB core budgets (est. +250–400 B gz total).

## Phase B — ShareVoice backend + hub enablement

Executed in the ShareVoice repo per its own conventions (contract exchange, codex-review-loop).

- [ ] **B1. Flag plumbing** — `feedback_mode_enabled` carried in deployment + private-launch `metadata` (shortcode-level overrides deployment-level): hub toggles in [CreateDeploymentDialog.tsx](/Users/brijeshpatel/Apps/ShareVoice/sensavera-hub/src/features/campaigns/composition/CreateDeploymentDialog.tsx) and [CreatePrivateLaunchDialog.tsx](/Users/brijeshpatel/Apps/ShareVoice/sensavera-hub/src/features/campaigns/composition/CreatePrivateLaunchDialog.tsx); backend propagates into the session and surfaces it in the WelcomeContext/SessionState payload ([resolve.py](/Users/brijeshpatel/Apps/ShareVoice/sensavera-backend/app/api/resolve.py), [responses.py](/Users/brijeshpatel/Apps/ShareVoice/sensavera-backend/app/models/responses.py)).
- [ ] **B2. Token mint endpoint** — `POST /v1/sessions/{session_id}/feedback-token`: 403 unless the session has feedback mode enabled; mints a short-lived Deepgram grant token (backend currently uses only the master API key — new ephemeral-token call in [services/deepgram.py](/Users/brijeshpatel/Apps/ShareVoice/sensavera-backend/app/services/deepgram.py); scope STT-only, 5–15 min TTL). Session possession is the auth (same trust model as the rest of the member flow).
- [ ] **B3. Ingestion endpoint** — `POST /v1/sessions/{session_id}/feedback-annotations` with a **new lightweight model** (session_id, route, exchange context if derivable, comment id/text/modality/voice meta, anchor JSON, timestamps). Recommendation: don't shoehorn pins into `CodexScoreFindingV2` — spatial route-anchored pins are a different shape; add a mapping/export into the review flow later if wanted. Upsert by comment id (pinflow `onChange` will re-send on edits).

## Phase C — sensavera-frontend embedding

- [ ] **C1. `FeedbackLayer` component**, `next/dynamic`-imported with `ssr: false`, mounted in `SessionClient` **only when** the flag is on. The pinflow dependency lives only inside this chunk — main bundle stays untouched (verify with `ANALYZE=true`).
- [ ] **C2. Init wiring** — `project: campaign_id`, `reviewer: session_id` (no prompt), `activation: { mode: 'stealth' }`, `voice: { getToken }` → B2 endpoint, `onChange` → debounced POST to B3, `theme` → sensavera tokens (C3).
- [ ] **C3. Theme mapping** (design pass under `/impeccable` — no AI slop): `fontFamily: DM Sans`, `accent: #2d8b8b` (teal), `accentContrast: #f1faee` (cream), `surface: #ffffff`, `text: #1a2332`, `textMuted: #4a5568`, `danger: #e07a5f` (coral — matches sensavera's recording semantic for the voice dot), `radius: 14px` (`--radius-md`), `shadow: 0 4px 20px rgba(26,35,50,0.1)` (navy-tinted, never black). The popup should read as a quiet cousin of `TextInputInterface` — same input border treatment (`border-seafoam/20`, teal focus), same button voice.
- [ ] **C4. Mic + CSP guardrails** — host-gate voice concurrency: don't allow feedback recording while a sensagram recording is in flight (pinflow degrades to text if the host simply doesn't pass `voice`, or gate at the UX layer); verify CSP allows `blob:` worker-src (pinflow worklet) and `wss://api.deepgram.com` connect-src ([next.config.ts:81+](/Users/brijeshpatel/Apps/ShareVoice/sensavera-frontend/next.config.ts)); mic Permissions-Policy is already scoped to session pages, which is where sensagrams run.

## Integration test scenarios (cross-layer, beyond unit tests)

1. Flag off → zero pinflow bytes in any loaded chunk (network panel + analyzer).
2. Long-press on mobile Safari during the reflecting phase → pin drops, popup themed, voice records, transcript lands, annotation POSTed with session attribution.
3. Feedback voice attempted while sensagram is recording → cleanly gated (no dual-stream fight on iOS).
4. Deepgram token expiry mid-session → next recording re-mints via `getToken`; failure degrades to text silently.
5. SPA phase transitions → pins stay anchored to their route; export/ingest carries the right exchange context.

## Sequencing & risks

- **A3 (publish/link) blocks C.** A1/A2 are small; B and A can run in parallel.
- ShareVoice-side work follows that repo's contract-exchange + review conventions; this plan is the cross-repo source of truth, with the pinflow side executed here.
- Risk: Deepgram ephemeral-token API availability on the current plan/SDK — verify early in B2 (it's the only new external surface).
- Pinflow v2 plan Phases 3–5 (token hardening, export polish, a11y) remain open and are complementary — B2/C2 exercise `getToken` exactly as Phase 3 anticipated.

## Sources

- Origin: user directive 2026-07-04 (feedback mode embedding, hub enablement, stealth gesture UX, `/impeccable` design bar)
- Exploration: sensavera-frontend + hub/backend agent reports 2026-07-04 (file refs inline above)
- Related: [2026-07-03-001 razor-thin plan](2026-07-03-001-refactor-razor-thin-bundle-optimization-plan.md) (completed), [2026-06-20-001 v2 plan](2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md) (Phases 3–5 open)
