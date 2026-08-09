# Build & release

Three tsup entry groups build core, voice, and framework wrappers to ESM/CJS/IIFE (es2020 targets, minified). Size budgets are hard CI gates. Releases flow through changesets.

## Build configs (`tsup.config.ts`)

- **Core + voice** (`src/core/index.ts`, `src/voice/index.ts`): ESM + CJS. Core externalizes `@brijeshp/pinflow/voice` so the lazy `import('@brijeshp/pinflow/voice')` stays a runtime reference — voice never enters the core graph ("0 bytes for text users").
- **IIFE** (`src/core/iife.ts` → `dist/pinflow.iife.js`): minified standalone bundle for CDN (unpkg/jsdelivr). Also externalizes `@brijeshp/pinflow/voice`.
- **Wrappers** (`src/react/index.ts`, `src/vue/index.ts`): ESM + CJS. They import bare `pinflow` (not dist paths), resolved by the consumer's bundler through this package's `exports` map — prevents shipping a second copy of core inside each wrapper and keeps wrappers ~1 KB.

**Private-member mangling:** `mangleProps: /^_/` (the `MANGLE_PRIVATE` regex in `tsup.config.ts`) is applied to every config. `_`-prefixed members (Annotator, GestureController, TranscriptStore, …) are renamed during minification — never rename or un-prefix them casually; they are part of the minification contract.

**`__PINFLOW_VERSION__`** is a compile-time define read from `package.json`. Vitest doesn't inject it; `src/core/index.ts` carries a `typeof` fallback for test runtime.

## Size budgets (`package.json` `size-limit`)

| Entry         | Budget (gz) |
| ------------- | ----------- |
| core IIFE     | 16.39 KB    |
| core ESM      | 16.04 KB    |
| voice ESM     | 4.45 KB     |
| react wrapper | 0.47 KB     |
| vue wrapper   | 0.61 KB     |

`pnpm size` gates CI (`verify` job) and publishing (`prepublishOnly` runs build + test + size). Policy: budgets only ratchet **down** between features — kept razor-thin over actuals so regressions surface immediately. (The core budgets were raised one notch as a deliberate, changeset-documented trade for the v3 lifecycle features, then re-ratcheted to actuals; the 0.5.0 direct-manipulation work — hover outline, drag-to-marquee, one-dock chrome, and the Alt gesture grammar, net of the deleted reviewer panel and control pill — notched core again, see its changeset.) Check budget impact after any core change.

## Release flow

- `pnpm changeset` for every user-facing change (`.changeset/config.json`: public access, baseBranch `main`).
- `release.yml` uses `changesets/action@v1` to open a version PR / publish to npm on push to `main` (requires `NPM_TOKEN`).
- npm publish protections are belt-and-braces: `files` allowlist (`dist`, `README.md`, `LICENSE`, `CHANGELOG.md`) **and** a whitelist-style `.npmignore` (`*` then `!` negations). Provenance enabled (`publishConfig.provenance: true`).

## CI (`.github/workflows/`)

- **`ci.yml`** — `verify` job: `format:check`, `typecheck`, `build` (BEFORE tests so bundle-isolation hard-fails rather than skips), `test:coverage` (the 80/75 thresholds are enforced in CI), `size`, `wiki:check`. `e2e` job: build + Playwright across chromium / mobile-chrome / mobile-safari. pnpm caching in both.
- **`release.yml`** — changesets publish on push to `main`, gated by re-running the full battery (format/typecheck/build/coverage/size/E2E/wiki-check) on the exact SHA before publishing; `prepublishOnly` independently runs build + coverage + size.
- ⚠️ The repo currently has **no git remote**; both workflows are dormant until pinflow is pushed to GitHub. `AGENTS.md` documents the local-only workflow.

## Command reference (`package.json` scripts)

| Command              | Does                                            |
| -------------------- | ----------------------------------------------- |
| `pnpm build`         | tsup (all configs)                              |
| `pnpm dev`           | tsup --watch                                    |
| `pnpm test`          | vitest run                                      |
| `pnpm test:watch`    | vitest watch                                    |
| `pnpm test:coverage` | vitest run --coverage                           |
| `pnpm test:e2e`      | playwright test                                 |
| `pnpm typecheck`     | tsc --noEmit                                    |
| `pnpm format`        | prettier --write .                              |
| `pnpm format:check`  | prettier --check . (CI gate)                    |
| `pnpm size`          | size-limit (CI + prepublish gate)               |
| `pnpm wiki:check`    | wiki staleness check (`scripts/wiki-check.mjs`) |
| `pnpm changeset`     | create a changeset                              |
| `pnpm release`       | build + changeset publish                       |

Prettier config lives inline in `package.json`: singleQuote, semi, trailingComma `all`, printWidth 100. Engines: node >= 18; package manager: pnpm.
