# Pinflow codebase wiki

Agent-maintained map of this codebase. It exists so coding agents (Claude Code, Codex) don't re-derive the architecture every session — read the relevant page before grepping.

## Rules of use

- **Trust order** (from `AGENTS.md`): config-enforced values > `AGENTS.md` invariants > this wiki > spec/README prose. If a page disagrees with the code, the page is wrong — fix it via the procedure in `.claude/skills/wiki-update/SKILL.md`.
- `docs/wiki/.last-sync` holds the commit this wiki reflects; `pnpm wiki:check` reports drift.
- Pages reference file paths and symbol names, never line numbers.
- Never describe planned work here — plans live in `docs/plans/`.

## Pages

| Page                                           | Read it when you're…                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| [architecture.md](./architecture.md)           | landing cold; need the module map, boundaries, and data flow          |
| [core.md](./core.md)                           | touching `src/core/**` — engine internals, storage, anchoring, export |
| [voice.md](./voice.md)                         | touching voice or anything near the core↔voice seam                   |
| [api.md](./api.md)                             | changing the public API surface, config types, or wrappers            |
| [build-and-release.md](./build-and-release.md) | touching build config, budgets, publishing, CI                        |
| [testing.md](./testing.md)                     | writing or debugging tests                                            |

## Scope note

`specs/pinflow_v1_spec.md` is the **v1** product spec; the voice module was added later via `docs/plans/2026-06-20-001-feat-voice-stealth-feedback-annotation-layer-plan.md`. Where the spec says "voice is deferred," the code has since shipped it — the code is authoritative.
