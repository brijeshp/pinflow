# Production readiness audit — 2026-07-23

Scope: full repo at `main` (`61a66ec`) + this branch's fixes. Method: mechanical gates, dimension-by-dimension manual passes, live browser probes, external Codex certification (verdict recorded below).

## Gate results (at audit head)

| Gate                                           | Result                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Unit                                           | 274 passed                                                                                                |
| E2E (chromium / mobile-chrome / mobile-safari) | 27 passed                                                                                                 |
| Coverage (`src/core/**`)                       | 96.8% lines / 92.3% branches (gate: 80/75)                                                                |
| Typecheck / format / wiki-check                | clean                                                                                                     |
| Size budgets                                   | green — core ESM 12.19/12.2 KB gz, IIFE 12.53/12.55, voice 4.12/4.2, react 320 B/0.4 KB, vue 518 B/0.6 KB |
| Runtime dependencies                           | **zero** (invariant holds); peers react/vue only                                                          |

## Fixes landed by this audit

1. **Prompt-injection escaping now has a regression lock** (`tests/core/export.test.ts`). The AGENTS.md invariant ("never weaken it") had no hostile-input test; a crafted multiline comment now proves every reviewer line stays blockquoted and fake headings/instructions are neutralized.
2. **Pins are real `<button>`s** with `aria-label`s — keyboard operability (Tab/Enter/Space) by construction, not re-implemented handlers. E2E selector updated; visual parity verified live (size/shape/colors unchanged).
3. **`prefers-reduced-motion` honored** — pin/chip pop animations disabled, elements land at final transform. Locked by a stylesheet test.
4. **Font-stack hardening** — `.root`'s `var(--pf-font-family, …)` fallback now carries the full static stack instead of `inherit`, so untokened embeds no longer depend on `:host`'s font surviving `all:initial` (observed dropping to serif in one Chromium build).

## Accepted deviations (documented, not defects)

- **`ui/annotator.ts` at ~1130 lines** exceeds the 800-line guideline. It is one cohesive interaction state machine whose private members share the `_`-mangling contract; splitting the class across files would trade real coupling risk for a line-count number. Revisit only if a natural seam appears (e.g., builder mode extraction).
- **Pins in builder mode are focusable but inert** (click no-ops by design — builder is read-only). Harmless; a `disabled` state would gray them undesirably.

## Known open items (tracked elsewhere)

- **Vue wrapper config parity** (`theme`/`source`/`onChange`/`routeKey`/`describeRoute`/`submitTo` not forwarded) — fix in flight in a separate session (task_5e76ee16). `exportUi` already fixed.
- **npm publish + git remote** — deliberate product decision pending (L3.1); release workflow, changesets, `files` allowlist, `.npmignore`, provenance are staged and audited.
- CDN/IIFE voice loading is documented as text-degrading (no resolver on that path) — by design for v1.

## Dimension notes

- **Clean**: no `console.log`, no TODO/FIXME, no `innerHTML`/`eval`, prettier-enforced; examples reference only current APIs.
- **Functional**: all gates + live browser passes (demo, both activation modes, export surfaces).
- **Minimal**: zero deps; hand-minified stylesheet; budgets razor-thin by policy; no dead exports found.
- **Scalable**: reflow path is rAF-throttled translation-only with anchor caches; selector fingerprint walk capped at 2000 elements; storage writes guarded (quota → single warning, in-memory fallback when blocked).
- **Extensible**: core↔voice isolation enforced by build config + bundle-isolation test; typed voice contract; sync protocol documented (PROTOCOL.md); artifact toolkit exported for host-side rendering; changesets govern releases.
- **Maintainable**: agent-maintained wiki with drift gate (`wiki:check`); AGENTS.md invariants; 274 tests mirroring src layout; conventions enforced in CI config.
- **Production-ready**: untrusted-input escaping locked; shadow-DOM isolation (`all:initial`, `color-scheme`); SSR-safe init (inert handle); no secrets; a11y pass (buttons, labels, reduced motion, 16px touch inputs); dark mode; LICENSE + publish protections in place.

## Codex certification

See `docs/audits/2026-07-23-production-audit-codex.md` (verdict transcribed verbatim).
