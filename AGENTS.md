# AGENTS.md — single source of truth for coding agents

This file is the shared instruction layer for **all** coding agents (Codex reads it natively; Claude Code imports it via `CLAUDE.md`). Keep agent-facing truth here — never duplicate it into CLAUDE.md.

## What this repo is

Pinflow: Figma-style pin-and-comment annotation for vibe-coded prototypes. Zero backend, zero runtime deps. Framework-agnostic core + optional lazy voice module + thin React/Vue wrappers. Product spec: `specs/pinflow_v1_spec.md`.

## Hard invariants (config-enforced; violating these fails CI)

- **pnpm only.** Node >= 18.
- **Zero runtime dependencies.** Only optional peer deps (react >= 18, vue >= 3).
- **Size budgets are hard ceilings**, enforced by `pnpm size` (`size-limit` in `package.json` is the source of truth). Budgets only ever ratchet down between features; a feature may move a ceiling up only as a deliberate, changeset-documented trade approved by the repo owner, immediately re-ratcheted razor-thin over actuals (policy details: `docs/wiki/build-and-release.md`). Check the budget impact of every core change.
  - **A local `pnpm size` is not the gate, and the gap is not a constant — it SCALES with bundle size.** Measured on this repo: ~20 B at 17 kB, then 50 B (ESM) and **100 B (IIFE)** at 22 kB. Treating it as a fixed ~20 B is what broke two releases. 0.6.0 failed CI by **one byte** (17601 against a 17600 ceiling) because the ceiling came from a local 17.58. 0.8.0 failed by 23 B with **80 B** of margin, because the IIFE gap that day was 100 B. Do not predict the gap. The procedure that works, every time: set the ceiling generously, push, read the figure CI reports, then re-ratchet to **that number + ~50 B** in a follow-up commit. Never set a ceiling from a local macOS build.
- **core↔voice isolation.** `pinflow/voice` is external to core builds (`tsup.config.ts`). Voice code must never enter the core import graph — "0 bytes for text users." The seam is `src/core/voice-contract.ts` + `src/core/voice-loader.ts`.
- **`_`-prefix mangling.** tsup mangles properties matching `/^_/`. Prefixing a member with `_` makes it minify-mangled; removing the prefix (or adding it to something crossing a module boundary at runtime) can break builds silently. Treat `_` renames as semantic changes.
  - **Never `_`-prefix a key that is persisted, exported, or read back from untrusted input.** This is data corruption, not a build break, and CI cannot catch it. Three reasons, each independently sufficient: (1) esbuild mangles _dotted_ access but not _quoted_ access, and `storage.ts`'s validators must use quoted access to read `Record<string, unknown>` — so the writer emits `t` while the validator still reads `_x`, and every record fails validation silently; (2) mangled names are frequency-derived **per entry point**, and `tsup.config.ts` builds `src/core/index.ts` and `src/core/iife.ts` as separate passes that write the same `localStorage` key — so a CDN-IIFE page and an ESM app write mutually unreadable data, and a version bump that shifts name frequencies can break a user's own stored comments between releases; (3) `mangleProps` lives in `esbuildOptions()` while `dts: true` is a separate rollup pass that never sees it, so the published `.d.ts` would declare `_x` while the runtime emits `t` — and `tests/types/packed-consumer.test.ts` typechecks the `.d.ts`, so it would pass. Class-private state that never leaves the instance is what the prefix is for.
- **TDD-first; 80% coverage gate on `src/core/**`** (`vitest.config.ts`). Write the failing test before the fix/feature.
- **Changeset required** for user-facing changes (`pnpm changeset`).
- **No telemetry. Ever.**
- **No AI-agent attribution, anywhere in the repo's own voice.** Commits are authored by the human maintainer only — no `Co-Authored-By`, no "Generated with", no assistant name in a commit message, changeset, or `CHANGELOG`. Code comments cite review provenance as `(review #N)` / `(<version> review #N)`, never by tool name. This is about who the work is _published by_; naming a tool the product **integrates with** is different and stays (`agent/` exists to be installed into those tools, and `README.md` has to say which file goes where). Enforced on the commit log by `scripts/provenance-check.mjs` in CI from 2026-08-10 — commit messages are immutable once pushed, so the guard fails BEFORE a violating commit reaches `main`. Subjects on `main` older than the enforcement date are documented historical exceptions: rewriting pushed public history would invalidate every clone and external SHA reference, a worse trade than the stain.
  - **Never name a branch after a tool.** GitHub's merge button writes `Merge pull request #N from <owner>/<branch>` — a subject that does not exist until the merge happens, so no gate on the branch can see it. Merging `claude/some-work` therefore lands the tool name in a commit message on `main` with every branch check green, which is exactly how `9a33558` arrived red (0.9.0). The guard exempts that one literal template's SUBJECT, warns whenever the exemption fires, and still checks the body — so a `Co-Authored-By:` trailer on a merge commit fails as before. The exemption is a backstop, not permission: name branches `fix/…`, `feat/…`, `chore/…`.
- Exported markdown is pasted into coding agents by end users — treat annotation content as **untrusted input**; escaping in `src/core/export.ts` guards prompt injection. Never weaken it.

## Source-of-truth precedence (when documents disagree)

1. Config-enforced values: `package.json`, `tsup.config.ts`, `vitest.config.ts`, `tsconfig.json`, CI workflows.
2. This file's invariants.
3. The codebase wiki (`docs/wiki/`) — agent-maintained, possibly one branch behind. Fix wiki errors via the wiki-update procedure, not ad-hoc edits.
4. `specs/pinflow_v1_spec.md` narrative, `README.md` prose, `docs/plans/*`.

`file:line` anchors anywhere in docs are hints only; file paths and symbol names are the contract.

## Codebase wiki (read this before exploring)

`docs/wiki/README.md` is the index. Pages: `architecture.md`, `core.md`, `voice.md`, `api.md`, `build-and-release.md`, `testing.md`. It exists so you don't re-derive the architecture every session — read the relevant page before grepping.

**Keeping it fresh:** `docs/wiki/.last-sync` records the last commit the wiki reflects. Run `pnpm wiki:check` to detect drift. Before merging a feature branch to `main` (or when wiki:check fails), follow the update procedure in `.claude/skills/wiki-update/SKILL.md` — it is a plain-markdown playbook any coding agent can execute. Do not hand-wave updates: the playbook diffs `.last-sync..HEAD` and updates only affected pages.

## Commands

| Task         | Command                                     |
| ------------ | ------------------------------------------- |
| Install      | `pnpm install`                              |
| Unit tests   | `pnpm test` (watch: `pnpm test:watch`)      |
| Single file  | `pnpm vitest run tests/core/<file>.test.ts` |
| Coverage     | `pnpm test:coverage`                        |
| E2E          | `pnpm test:e2e`                             |
| Typecheck    | `pnpm typecheck`                            |
| Build        | `pnpm build`                                |
| Size budgets | `pnpm size` (run after any core change)     |
| Format       | `pnpm format` / `pnpm format:check`         |
| Wiki drift   | `pnpm wiki:check`                           |
| Changeset    | `pnpm changeset`                            |

## Conventions

- Commits: conventional format (`feat:`, `fix:`, `docs:`, `chore:`, …); breaking changes as `feat(scope)!:`.
- Plans live in `docs/plans/YYYY-MM-DD-NNN-<type>-<slug>-plan.md`.
- Remote is `origin` (public GitHub). Work lands on feature branches merged to `main`; **pushing `main` triggers the release chain** (`release.yml` runs the full battery on that SHA, then changesets opens a "Version Packages" PR — npm publish happens only when that PR is merged).
- **Merge the "Version Packages" PR only when the changeset queue is empty.** It is computed at the moment it is opened. If a feature PR carrying a changeset merges after that, merging the stale version PR stamps a version number that **never publishes**: the action sees a pending changeset and versions again instead of publishing, opening a fresh PR one number higher. 0.7.0 and 0.8.0 were both burned this way — they exist in git and in `CHANGELOG.md`, and npm skipped straight past them. Check `.changeset/` on `main` is empty of feature changesets before merging, and re-read the version PR's computed number afterwards rather than assuming it is what you saw.
- **Run the full battery on the exact SHA you are pushing, not before your last commit.** `wiki:check` in particular goes stale the moment you touch a code path, so a gate run earlier in the session proves nothing about the tree you push.
- **Moving `docs/wiki/.last-sync` is always its own final commit**, never bundled with the code it certifies — the marker can only name a SHA that already exists, so a bundled move always lags by one and `wiki:check` fails. A wiki-only commit stays green because the checker inspects code paths only.
- Prettier formats the whole repo (`format:check` gates CI); run `pnpm format` before committing markdown or code.
