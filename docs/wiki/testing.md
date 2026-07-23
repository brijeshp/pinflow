# Testing

Vitest (happy-dom) for units, Playwright for e2e. TDD-first per `CONTRIBUTING.md`: write the failing test before the implementation.

## Coverage gate (`vitest.config.ts`, scoped to `src/core/**`)

| Metric     | Threshold |
| ---------- | --------- |
| lines      | 80%       |
| functions  | 80%       |
| branches   | 75%       |
| statements | 80%       |

Excluded from coverage: `src/core/iife.ts`, `src/core/types.ts`, `src/core/voice-contract.ts`, `src/core/voice-loader.ts`, `.d.ts` files. The UI layer (`src/core/ui/**`, incl. the annotator state machine) IS inside the gate. Run with `pnpm test:coverage` — the same command CI enforces.

## Layout (mirrors `src/`)

- **`tests/core/`** — unit tests: annotator (+ reflow), gesture, anchor, selector, storage, router, route-key, frame-route, export, download, onchange, theme, dom, id, identity, init, safe-storage, voice-loader, wrapper-isolation.
- **`tests/voice/`** — audio, deepgram, token, session, worklet, protocol, transcript-store, levels, and **`bundle-isolation.test.ts`** (asserts voice symbols never appear in core bundles — the seam's CI enforcement).
- **`tests/react/`**, **`tests/vue/`** — wrapper component tests (`tests/vue/mount-helper.ts` utility).
- **`tests/e2e/`** — `acceptance.spec.ts` (Playwright), served by `tests/e2e/serve.mjs` on `localhost:4173`.

Vitest picks up `tests/**/*.test.ts` and colocated `src/**/*.test.ts`.

## Test infrastructure

- **`tests/setup.ts`** — MemoryStorage polyfill (newer Node localStorage quirks), `IS_REACT_ACT_ENVIRONMENT`, `CSS.escape` polyfill.
- **Aliases** (`vitest.config.ts`): `pinflow/voice` and bare `pinflow` resolve to `src/` sources so lazy voice stays lazy and wrappers exercise core internals without a build step.
- **Playwright** (`playwright.config.ts`): baseURL `http://localhost:4173`; projects chromium, mobile-chrome, mobile-safari; CI retries 2×, traces on first retry; reporter `github` in CI, `list` locally.

## How to run

| Task             | Command                                                |
| ---------------- | ------------------------------------------------------ |
| All units        | `pnpm test`                                            |
| Watch            | `pnpm test:watch`                                      |
| Single file      | `pnpm vitest run tests/core/annotator.test.ts`         |
| Coverage         | `pnpm test:coverage`                                   |
| E2E              | `pnpm test:e2e`                                        |
| Seam enforcement | `pnpm vitest run tests/voice/bundle-isolation.test.ts` |

## Expectations for agents

- New core behavior ⇒ failing test first, then implementation, then coverage stays ≥ gate.
- Touching the core↔voice seam ⇒ run `bundle-isolation.test.ts` and `pnpm size`.
- Fix implementations, not tests — unless the test itself is provably wrong.
