# Contributing to Pinflow

Thanks for your interest. Pinflow is intentionally small-scope — please read [`specs/pinflow_v1_spec.md`](./specs/pinflow_v1_spec.md) before opening an issue or PR, especially §3 (scope) and §12 (deferred features).

## Dev setup

```bash
pnpm install
pnpm test
pnpm build
```

## Workflow

1. Open an issue first for anything non-trivial.
2. Branch from `main`.
3. Write tests first. Target 80%+ coverage on `src/core/**`.
4. `pnpm changeset` to describe user-facing changes.
5. Open a PR. CI must pass (typecheck, tests, build, size budget).

## Ground rules

- **Zero runtime dependencies** in the core. If a dep is required, explain why in your PR.
- **Size budgets are hard ceilings**, enforced by `pnpm size` (`size-limit` in `package.json` is the source of truth — currently 11 KB gz core IIFE, 10.5 KB core ESM, 4.5 KB voice, 1 KB per wrapper). Budgets only ever ratchet down.
- Core must stay framework-agnostic. React/Vue wrappers are thin.
- No telemetry. Ever.

## Reporting security issues

Please do not open public issues for security problems. Email the maintainer listed in `package.json`.
