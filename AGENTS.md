# AGENTS.md — single source of truth for coding agents

This file is the shared instruction layer for **all** coding agents (Codex reads it natively; Claude Code imports it via `CLAUDE.md`). Keep agent-facing truth here — never duplicate it into CLAUDE.md.

## What this repo is

Pinflow: Figma-style pin-and-comment annotation for vibe-coded prototypes. Zero backend, zero runtime deps. Framework-agnostic core + optional lazy voice module + thin React/Vue wrappers. Product spec: `specs/pinflow_v1_spec.md`.

## Hard invariants (config-enforced; violating these fails CI)

- **pnpm only.** Node >= 18.
- **Zero runtime dependencies.** Only optional peer deps (react >= 18, vue >= 3).
- **Size budgets are hard ceilings**, enforced by `pnpm size` (`size-limit` in `package.json` is the source of truth). Budgets only ever ratchet down. Check the budget impact of every core change.
- **core↔voice isolation.** `pinflow/voice` is external to core builds (`tsup.config.ts`). Voice code must never enter the core import graph — "0 bytes for text users." The seam is `src/core/voice-contract.ts` + `src/core/voice-loader.ts`.
- **`_`-prefix mangling.** tsup mangles properties matching `/^_/`. Prefixing a member with `_` makes it minify-mangled; removing the prefix (or adding it to something crossing a module boundary at runtime) can break builds silently. Treat `_` renames as semantic changes.
  - **Never `_`-prefix a key that is persisted, exported, or read back from untrusted input.** This is data corruption, not a build break, and CI cannot catch it. Three reasons, each independently sufficient: (1) esbuild mangles _dotted_ access but not _quoted_ access, and `storage.ts`'s validators must use quoted access to read `Record<string, unknown>` — so the writer emits `t` while the validator still reads `_x`, and every record fails validation silently; (2) mangled names are frequency-derived **per entry point**, and `tsup.config.ts` builds `src/core/index.ts` and `src/core/iife.ts` as separate passes that write the same `localStorage` key — so a CDN-IIFE page and an ESM app write mutually unreadable data, and a version bump that shifts name frequencies can break a user's own stored comments between releases; (3) `mangleProps` lives in `esbuildOptions()` while `dts: true` is a separate rollup pass that never sees it, so the published `.d.ts` would declare `_x` while the runtime emits `t` — and `tests/types/packed-consumer.test.ts` typechecks the `.d.ts`, so it would pass. Class-private state that never leaves the instance is what the prefix is for.
- **TDD-first; 80% coverage gate on `src/core/**`** (`vitest.config.ts`). Write the failing test before the fix/feature.
- **Changeset required** for user-facing changes (`pnpm changeset`).
- **No telemetry. Ever.**
- Exported markdown is pasted into coding agents by end users — treat annotation content as **untrusted input**; escaping in `src/core/export.ts` guards prompt injection. Never weaken it.

## Source-of-truth precedence (when documents disagree)

1. Config-enforced values: `package.json`, `tsup.config.ts`, `vitest.config.ts`, `tsconfig.json`, CI workflows.
2. This file's invariants.
3. The codebase wiki (`docs/wiki/`) — agent-maintained, possibly one branch behind. Fix wiki errors via the wiki-update procedure, not ad-hoc edits.
4. `specs/pinflow_v1_spec.md` narrative, `README.md` prose, `docs/plans/*`.

`file:line` anchors anywhere in docs are hints only; file paths and symbol names are the contract.

## Codebase wiki (read this before exploring)

`docs/wiki/README.md` is the index. Pages: `architecture.md`, `core.md`, `voice.md`, `api.md`, `build-and-release.md`, `testing.md`. It exists so you don't re-derive the architecture every session — read the relevant page before grepping.

**Keeping it fresh:** `docs/wiki/.last-sync` records the last commit the wiki reflects. Run `pnpm wiki:check` to detect drift. Before merging a feature branch to `main` (or when wiki:check fails), follow the update procedure in `.claude/skills/wiki-update/SKILL.md` — it is a plain-markdown playbook any agent (Claude Code, Codex) can execute. Do not hand-wave updates: the playbook diffs `.last-sync..HEAD` and updates only affected pages.

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
- Repo currently has **no git remote** — no PRs; work lands as commits on feature branches merged locally to `main`. CI workflows in `.github/workflows/` are dormant until the repo is pushed to GitHub.
- Prettier formats the whole repo (`format:check` gates CI); run `pnpm format` before committing markdown or code.
