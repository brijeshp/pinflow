---
name: wiki-update
description: Update docs/wiki/ to reflect code changes since the last sync. Use before merging a feature branch to main, when `pnpm wiki:check` reports drift, or when a wiki page is found to be wrong.
---

# Wiki update procedure

This playbook is plain markdown so any coding agent — or a human — can execute it. The wiki replaces per-session architecture re-derivation; its value collapses if it silently rots, so updates are diff-driven and end by moving the sync marker.

## Contract

- `docs/wiki/.last-sync` contains exactly one line: the full SHA of the last commit the wiki reflects.
- The wiki describes **the code as it is**, never as it is planned to be. Plans live in `docs/plans/`.
- Reference code by file path + exported symbol name. **Never line numbers** — they rot.
- Precedence rules are in `AGENTS.md`: if the wiki disagrees with config-enforced values, the wiki is wrong — fix the wiki.

## Steps

1. **Compute the drift window.**

   ```bash
   LAST=$(cat docs/wiki/.last-sync)
   git diff --stat "$LAST"..HEAD -- src tsup.config.ts vitest.config.ts playwright.config.ts package.json tsconfig.json
   git log --oneline "$LAST"..HEAD
   ```

   If the diff is empty: update `.last-sync` to `git rev-parse HEAD`, done.

2. **Map changed paths to pages.**

   | Changed path                                                                                     | Page(s) to review                        |
   | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
   | `src/core/index.ts`, `src/core/types.ts`, `src/*/index.ts`, `package.json` `exports`             | `api.md`                                 |
   | `src/core/**` (internals)                                                                        | `core.md`                                |
   | `src/voice/**`, `src/core/voice-contract.ts`, `src/core/voice-loader.ts`                         | `voice.md`                               |
   | `tsup.config.ts`, `package.json` (scripts/size-limit/files), `.changeset/`, `.github/workflows/` | `build-and-release.md`                   |
   | `vitest.config.ts`, `playwright.config.ts`, `tests/**` layout changes                            | `testing.md`                             |
   | Module boundaries moved / files added-removed-renamed                                            | `architecture.md` + the page owning them |

3. **For each affected page:** read the actual changed source (not just the diff), then edit the page so every statement matches the code. Delete sections describing removed code — do not leave "historical" notes. If a whole module disappeared, delete its wiki section and fix inbound references (`grep -rn "<name>" docs/wiki/`).

4. **Spot-check invariants** (cheap, always do it): confirm the wiki's claims about size budgets, coverage thresholds, and the exports map still match `package.json` / `vitest.config.ts`. These are the highest-blast-radius claims.

5. **Finish.**

   ```bash
   git rev-parse HEAD > docs/wiki/.last-sync
   pnpm format
   pnpm wiki:check   # must pass now
   git add docs/wiki && git commit -m "docs(wiki): sync to $(git rev-parse --short HEAD)"
   ```

   Note: committing moves HEAD past the recorded SHA; `wiki:check` only inspects code paths, so a wiki-only commit stays green.

## When a page is simply wrong (no code change)

Fix the page directly, keep `.last-sync` untouched, commit as `docs(wiki): correct <page> — <what was wrong>`. If the error came from a source doc (spec/README), fix that source too per AGENTS.md precedence.
