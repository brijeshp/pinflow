---
title: 'chore: Adopt OpenWiki as the agent-facing codebase wiki (Claude Code + Codex)'
type: chore
status: active
date: 2026-07-06
---

# chore: Adopt OpenWiki as the agent-facing codebase wiki (Claude Code + Codex)

## Overview

Adopt [OpenWiki](https://github.com/langchain-ai/openwiki) (LangChain's MIT-licensed, DeepAgents-based repo-documentation CLI) so pinflow carries a generated, continuously-refreshed wiki of its own codebase — and wire it so **one source of truth serves both Claude Code and Codex**:

- `openwiki/` — generated markdown wiki, organized by repo structure, committed to git.
- `AGENTS.md` — net-new, hand-authored invariants + OpenWiki's appended wiki-pointer block. Codex reads this natively.
- `CLAUDE.md` — thin one-line import of `AGENTS.md` (`@AGENTS.md`) plus Claude-specific notes only. Claude Code reads this natively.
- `.github/workflows/openwiki-update.yml` — scheduled `openwiki --update` that opens a reviewable PR when code drifts from docs.

The irony this fixes: pinflow's _product_ is "AI-agent-ready markdown export for Claude Code/Codex," yet the repo itself has **no** CLAUDE.md, AGENTS.md, or agent navigation docs today (verified — greenfield, nothing to reconcile).

## Problem Statement / Motivation

- The de facto architecture doc is [specs/pinflow_v1_spec.md](../../specs/pinflow_v1_spec.md) (562 lines) — a _product spec_, not a codebase map. Agents must re-derive the architecture (core↔voice seam, bundle-budget rules, mangling convention) every session.
- The repo's hard invariants (pnpm, zero runtime deps, 11 KB gz core budget, `_`-prefix mangling, voice-never-in-core) live only in config comments ([tsup.config.ts](../../tsup.config.ts), `package.json` size-limit block) and plan docs. Nothing loads them into agent context automatically.
- Documentation already rots here: `CONTRIBUTING.md:24` and `README.md:161` still say **"30 KB gzipped ceiling"** while `package.json` size-limit enforces **11 KB** on core IIFE. Plan docs carry `file:line` anchors that have rotted.
- Both Claude Code and Codex work in this repo; today neither has an instruction file, so behavior/context is nondeterministic across sessions and across agents.

## Verified OpenWiki Facts (research, 2026-07-06)

- Install/run: `npm install -g openwiki`, then `openwiki --init` (interactive provider setup) or `openwiki --update --print` (non-interactive refresh from git diffs). Config/keys live in `~/.openwiki/.env`.
- Providers: Anthropic, OpenAI, OpenRouter, Fireworks, Baseten via `OPENWIKI_PROVIDER`, `OPENWIKI_MODEL_ID`, `ANTHROPIC_API_KEY`, etc.
- Output: `openwiki/` directory at repo root; pointer instructions appended to `AGENTS.md`/`CLAUDE.md` (references, not embedded content — no context bloat).
- Official GitHub Action (`examples/openwiki-update.yml`): cron `0 8 * * *` + `workflow_dispatch`, Node 22, `openwiki --update --print`, then `peter-evans/create-pull-request@v7` (branch `openwiki/update`, `add-paths: openwiki`).
- Optional LangSmith tracing (`LANGSMITH_API_KEY`).

## Proposed Solution

Four phases, ordered so hand-authored truth exists **before** generation (SpecFlow flagged that running `--init` first risks a machine-generated AGENTS.md skeleton that Phase 2 then fights).

### Phase 0 — Pre-requisites (do these first; each is independently shippable)

> **Execution reality check (2026-07-06):** the repo currently has **no git remote** — it is local-only (vendored into sensavera as a tarball). Phase 3's GitHub Action, PR-based updates, and Actions secrets all require pushing pinflow to GitHub first. Until then, wiki refresh is manual (`openwiki --update` locally, cron-only-writer policy still applies in spirit: one designated machine). Add "create GitHub repo + push" as a Phase 3 gate.

0. **Push to GitHub (Phase 3 gate only).** Phases 0–2 work fully offline; do not block on this.
1. **Fix the doc-drift bug now** (it's a bug today, a wiki-poisoning vector at `--init` time): correct "30 KB" → current enforced budgets in `CONTRIBUTING.md:24` and `README.md:161`, citing `package.json` size-limit as the source of truth. _(Done 2026-07-06 — committed on `refactor/razor-thin-bundle` rather than a separate PR, since with no remote there are no PRs and this branch merges to `main` before `--init` runs anyway.)_
2. **Land or park `refactor/razor-thin-bundle`.** Run `--init` from `main` after the refactor merges — initializing mid-refactor bakes in a wiki of a transient tree and makes the first cron diff huge/confusing.
3. **Mint a dedicated, spend-capped Anthropic API key** for OpenWiki (repo is public; key is used locally + as an Actions secret `OPENWIKI_API_KEY`).
4. **Scratch-branch probe** (throwaway branch, answers the unverified behaviors before anything ships). _(Status 2026-07-06: blocked — no `ANTHROPIC_API_KEY` in the environment and no `~/.openwiki/.env`; needs the dedicated key from item 3.)_
   - Run `openwiki --init`; note whether it creates AGENTS.md or only appends when present.
   - Run `openwiki --update` **twice back-to-back**; diff. Pass = hand-authored sections byte-identical, exactly one pointer block (marker `grep -c` == 1). Fail = pointer block must be maintained by hand and `--update` restricted to `openwiki/` paths only.
   - Find where "last run" state lives (`~/.openwiki` vs inside `openwiki/`) — decides whether local `--update` and cron can coexist (default policy: **cron is the only writer**; local runs are dry-run only).
   - Move/delete one `src/` file; verify `--update` removes the orphaned wiki page.

### Phase 1 — Hand-author the agent-instruction layer

Create `AGENTS.md` (Codex-native) with, at minimum:

```markdown
# AGENTS.md (single source of truth — CLAUDE.md imports this)

## Hard invariants (config-enforced; violating these fails CI)

- pnpm only. Node >= 18. Zero runtime dependencies (peer deps: react/vue, optional).
- Size budgets are hard ceilings (package.json "size-limit"): core IIFE 11 KB gz,
  ESM 10.5 KB, voice 4.5 KB, wrappers 1 KB. `pnpm size` gates CI and publish.
- core↔voice isolation: `pinflow/voice` is external to core builds (tsup.config.ts).
  Voice code must never enter the core graph — "0 bytes for text users."
- Private members use `_` prefix — tsup mangles `/^_/`; renaming breaks minification safety.
- TDD-first; 80% coverage gate on src/core (vitest.config.ts). Changeset required
  for user-facing changes.

## Source-of-truth precedence (when documents disagree)

1. Config-enforced values (package.json, CI workflows, tsconfig, tsup.config.ts)
2. This file's invariants
3. Generated wiki (openwiki/) — generated, possibly stale; never hand-edit,
   fix at source instead
4. specs/pinflow_v1_spec.md narrative and README prose
   File:line anchors anywhere in docs are hints; file paths are the contract.

## Codebase map

See the generated wiki: openwiki/ (OpenWiki pointer block appended below by tooling)
```

Create `CLAUDE.md` containing only:

```markdown
@AGENTS.md

<!-- Claude-specific notes only below this line; shared truth lives in AGENTS.md -->
```

This gives Codex and Claude Code identical shared context with zero drift surface (SpecFlow I2: OpenWiki should be pointed at AGENTS.md only; if `--init` writes to both, strip the CLAUDE.md copy).

Update `CONTRIBUTING.md`: contributors never touch `openwiki/`; wiki staleness ≤ 1 cron interval is accepted; code is authoritative.

### Phase 2 — Generate and commit the wiki

1. From `main`: `openwiki --init` (Anthropic provider, pinned `OPENWIFI_MODEL_ID` — see note in Phase 3 YAML; use the same model locally and in CI for consistent output).
2. Add `openwiki/` to `.prettierignore` (today's file only covers dist/coverage/lockfiles/CHANGELOG/README — the wiki **will** be swept by `pnpm format:check` otherwise). Run `pnpm format` on `AGENTS.md`/`CLAUDE.md` instead of ignoring them, so the pointer block stays Prettier-clean.
3. **Review with a bar, not a skim** — checklist:
   - Every wiki claim about zero-deps, size budgets, core/voice isolation, pnpm cross-checked against source; wrong claims fixed **at source** (or the wiki page regenerated), never by hand-editing `openwiki/`.
   - The wiki's description of the core↔voice seam (`voice-contract.ts` / `voice-loader.ts`) must match AGENTS.md or defer to it.
   - No secrets/keys/personal paths leaked into generated pages.
4. Commit `openwiki/` + `AGENTS.md` + `CLAUDE.md` + ignore changes in one PR.

### Phase 3 — Automated freshness (GitHub Action)

Adapt the official example with four deliberate deviations (each maps to a SpecFlow finding):

```yaml
# .github/workflows/openwiki-update.yml
name: OpenWiki Update
on:
  workflow_dispatch:
  schedule:
    - cron: '0 8 * * 1' # weekly (Mon 08:00 UTC) — small repo, daily is noise
permissions:
  contents: write
  issues: write
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: true
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm install --global openwiki
      - run: openwiki --update --print
        env:
          ANTHROPIC_API_KEY: ${{ secrets.OPENWIKI_API_KEY }}
          OPENWIKI_PROVIDER: anthropic
          OPENWIKI_MODEL_ID: claude-haiku-4-5-20251001 # pinned; cheap+capable for doc refresh
      - run: npx prettier --write AGENTS.md CLAUDE.md || true # keep pointer block format:check-clean
      - uses: peter-evans/create-pull-request@v7
        with:
          token: ${{ secrets.OPENWIKI_PR_PAT }} # PAT, NOT GITHUB_TOKEN — see below
          add-paths: |
            openwiki
            AGENTS.md
          branch: openwiki/update
          commit-message: 'docs: update OpenWiki'
          title: 'docs: update OpenWiki'
      - name: Signal failure visibly
        if: failure()
        run: gh issue create --title "OpenWiki update failed ($(date -u +%F))" --body "See run $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" --label ci
        env: { GH_TOKEN: '${{ github.token }}' }
```

Deviations from the stock example, and why:

| Change                                                         | Reason (SpecFlow finding)                                                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token: OPENWIKI_PR_PAT` (fine-grained PAT, contents+PR write) | **C1**: PRs created with default `GITHUB_TOKEN` do not trigger `pull_request` workflows — the update PR would have zero CI checks (unmergeable under branch protection, or merged unverified without it). |
| `prettier --write` before PR                                   | **C2**: pointer-block rewrites would otherwise break `format:check` on the _next human's_ PR.                                                                                                             |
| Weekly, not daily                                              | Small repo (~3.1 K LOC); daily PRs are noise. `workflow_dispatch` covers on-demand.                                                                                                                       |
| On-failure issue creation                                      | **I4**: single-maintainer repo; a red scheduled run (or GitHub's 60-day cron auto-disable on inactive public repos) would otherwise freeze the wiki silently while agents keep trusting it.               |
| Pinned model ID                                                | **M4**: model deprecation is a cron-failure mode; pinning makes it a visible, diagnosable one.                                                                                                            |

Known accepted costs: each merged wiki PR runs full `ci.yml` (incl. Playwright) and a no-op `release.yml`. Path-filtering conflicts with required checks (skipped required checks block merges), so accept the cost initially; revisit with `paths-ignore` on the `e2e` job only if it grates.

### Phase 4 (optional, compounding) — Seed `docs/solutions/`

The 2026-06-20 voice plan (line ~771) already called for creating `docs/solutions/` and seeding it with the Async Resumption Contract, bundling-split, and migration gotchas. Do that now and add an AGENTS.md pointer, so wiki (generated map) + solutions (earned lessons) together form the institutional memory both agents load.

## System-Wide Impact

- **Interaction graph**: cron → `openwiki --update` → PR → merge to `main` → triggers `ci.yml` (verify + e2e) and `release.yml` (no-op without changeset). Wiki PRs need **no changeset** (docs-only, not user-facing — matches CONTRIBUTING policy).
- **Error propagation**: OpenWiki failure → workflow failure → auto-created issue (never silent). Bad generated content → caught by review checklist + precedence rule (agents trust config > AGENTS.md > wiki > prose).
- **State lifecycle risks**: `--update` state location unknown until the Phase 0 probe; policy "cron is the only writer" prevents local/CI state divergence and `openwiki/update` branch conflicts.
- **API surface parity**: npm publish is doubly protected already (`files` allowlist + whitelist-style `.npmignore`) — wiki/AGENTS.md/CLAUDE.md cannot ship in the package; verify once with `npm pack --dry-run`.
- **Agent parity**: Codex reads AGENTS.md; Claude Code reads CLAUDE.md → `@AGENTS.md`. One file, both agents, zero drift surface.

## Acceptance Criteria

### Phase 0

- [ ] `CONTRIBUTING.md` / `README.md` no longer claim 30 KB; they cite the enforced budgets or point at `package.json` size-limit.
- [ ] Scratch-branch probe answers recorded in this plan: init-vs-existing AGENTS.md behavior, double-`--update` idempotency, state location, orphan-page cleanup.

### Phases 1–2

- [ ] `pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm size` all pass on the commit adding `openwiki/` + `AGENTS.md` + `CLAUDE.md`.
- [ ] `npm pack --dry-run` lists zero `openwiki/`, `AGENTS.md`, or `CLAUDE.md` entries.
- [ ] `openwiki --update` run twice leaves hand-authored AGENTS.md sections byte-identical; pointer-block marker count == 1.
- [ ] `CLAUDE.md` = `@AGENTS.md` + Claude-only notes; no invariant stated in both files.
- [ ] Fresh Claude Code **and** Codex sessions, asked "what are the hard constraints in this repo?", both answer pnpm / zero runtime deps / size budgets / core-voice isolation / coverage gate without opening the spec.
- [ ] AGENTS.md contains the precedence rule and "never hand-edit `openwiki/`" rule; CONTRIBUTING.md tells contributors not to touch `openwiki/`.
- [ ] Review checklist executed; core↔voice seam description verified against `src/core/voice-contract.ts` / `voice-loader.ts`.

### Phase 3

- [ ] A `workflow_dispatch` run produces a PR on which `verify` actually executes and passes (proves the PAT solves the no-CI-on-bot-PR problem).
- [ ] A no-op run (no code changes since last update) produces no PR.
- [ ] Failure path demonstrated once (revoked key or forced error) → issue auto-created.
- [ ] Secret is the dedicated spend-capped key; model ID pinned in the workflow.

### Phase 4

- [ ] `docs/solutions/` exists, seeded with the voice-plan gotchas; AGENTS.md points to it.

## Alternative Approaches Considered

1. **Hand-maintained CLAUDE.md/AGENTS.md only (no wiki).** Cheapest; but it's exactly the pattern that produced the 30 KB drift — no refresh mechanism. Rejected as sole approach; Phase 1's hand-authored invariants layer survives regardless.
2. **DeepWiki / hosted doc services.** No repo-local artifacts → nothing for Codex/Claude to read offline in-context; external dependency + privacy surface for a zero-telemetry project. Rejected.
3. **`docs/CODEMAPS/` via doc-updater agent.** Viable, but bespoke: no update CLI, no upstream GitHub Action, maintenance is on us. OpenWiki is maintained upstream (LangChain), MIT, and purpose-built for the AGENTS.md wiring. Rejected in favor of OpenWiki; can coexist later.
4. **Gitignore the wiki, regenerate per-machine.** Breaks Codex/CI/fresh-clone agents that don't run OpenWiki, costs API tokens per developer, and diverges per machine. Rejected — commit it (matches repo's committed-authored-docs convention).

## Dependencies & Risks

| Risk                                                                       | Likelihood       | Mitigation                                                                                                                              |
| -------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--update` not idempotent on AGENTS.md (append-duplicates or full rewrite) | Unknown → probe  | Phase 0 probe gates Phase 2; fallback: hand-maintain pointer, restrict `add-paths` to `openwiki/` only (already done in the YAML above) |
| Hallucinated wiki content misleads agents                                  | Medium           | Precedence rule in AGENTS.md; review checklist; fix-at-source policy                                                                    |
| Bot PR merges unverified / can't merge                                     | High without fix | PAT token (C1) — acceptance test proves CI runs on the bot PR                                                                           |
| Cron dies silently (failure or 60-day auto-disable)                        | Medium           | On-failure issue step; weekly cadence keeps repo activity up                                                                            |
| API cost runaway                                                           | Low              | Spend-capped dedicated key; weekly cadence; cheap pinned model; ~3.1 K LOC repo                                                         |
| Wiki PR noise                                                              | Low              | Weekly + no-op-produces-no-PR acceptance test                                                                                           |

## Sources & References

### Internal (verified 2026-07-06)

- Repo research: single package, pnpm, TS 5.6 strict, tsup 3-config build, size-limit budgets `package.json:114-159`, mangling `tsup.config.ts:16`, voice externalization `tsup.config.ts:34-36`; no CLAUDE.md/AGENTS.md/.cursorrules exist.
- Doc-drift bug: `CONTRIBUTING.md:24`, `README.md:161` (30 KB) vs enforced 11 KB.
- `docs/solutions/` intent: `docs/plans/2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md` (~line 771).
- CI: `.github/workflows/ci.yml` (format:check/typecheck/test/build/size + e2e), `release.yml` (changesets). No scheduled workflows today.
- `.prettierignore` current contents: dist, node_modules, coverage, lockfiles, CHANGELOG.md, README.md — wiki not covered.

### External

- Announcement: https://www.langchain.com/blog/introducing-openwiki-an-open-source-agent-for-repo-documentation
- Repo (MIT): https://github.com/langchain-ai/openwiki — CLI flags, `~/.openwiki/.env`, provider env vars.
- Official action: `examples/openwiki-update.yml` (fetched verbatim 2026-07-06; adapted above).
- Known GitHub limitation: PRs created with default `GITHUB_TOKEN` don't trigger `pull_request` workflows (peter-evans/create-pull-request docs).

### AI-era notes

- Research performed by Claude Code (Fable 5) with parallel sub-agents (repo research, learnings, SpecFlow analysis); OpenWiki CLI behavior in Phase 0 probe is deliberately empirical because upstream docs don't specify `--update` write semantics.
