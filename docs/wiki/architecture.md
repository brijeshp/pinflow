# Architecture

Pinflow is a zero-backend annotation layer: a framework-agnostic core engine, an optional lazily-loaded voice module, and two thin framework wrappers. localStorage is the local-first source of truth; artifacts (markdown for pasting into coding agents, versioned JSON for machines) are generated client-side. Hosts that want cross-device sync and a team review lifecycle bring their own backend via the two-hook contract in `PROTOCOL.md` at the repo root: `onChange` is the write half, `config.source` the read half, and the server owns the `status`/`resolution` disposition.

## Module map

```
src/
  core/               framework-agnostic engine — the only required code
    index.ts          public entry: init() singleton → Handle { destroy, refreshRoute }
    types.ts          public config + data types (PinflowConfig, Comment, Anchor, …)
    ui/annotator.ts   the widget: pins, panels, editor popup (largest file in the repo)
    ui/styles.ts      hand-minified shadow-DOM CSS, --pf-* theme tokens
    ui/dom.ts         shadow-root factory
    gesture/          stealth activation (Alt+click / long-press)
    storage.ts        schema-versioned localStorage persistence (v1→v2 migration)
    safe-storage.ts   in-memory fallback when localStorage is blocked
    anchor.ts         element anchoring: build/resolve/screen-project anchors
    selector.ts       selector-candidate generation + resolution ladder
    router.ts         SPA route watching (history patching)
    route-key.ts      logical screen key derivation (strips pinflow URL params)
    export.ts         markdown export (the product's actual output)
    voice-contract.ts type-only port core exposes to voice (VoiceHost/VoiceSession)
    voice-loader.ts   the ONLY place voice is imported — dynamic import('pinflow/voice')
    iife.ts           CDN/script-tag auto-init shim
  voice/              optional module: mic capture, Deepgram streaming, dot UI
  react/index.ts      thin wrapper (<Annotator> component)
  vue/index.ts        thin wrapper (props mirror config; onSubmit → submitHandler)
```

Tests mirror this layout under `tests/` (see [testing.md](./testing.md)).

## The one boundary that matters: core↔voice

Voice must cost text-only users **0 bytes**. `pinflow/voice` is marked external in every core build config (`tsup.config.ts`), so the dynamic import in `src/core/voice-loader.ts` stays a runtime reference and voice code never enters the core graph. The interface between the two sides is the type-only contract in `src/core/voice-contract.ts`. `tests/voice/bundle-isolation.test.ts` enforces this in CI. Full detail: [voice.md](./voice.md).

## Data flow (happy path)

1. **Activate**: control button, or stealth gesture (`src/core/gesture/`) in `stealth`/`both` modes.
2. **Pin**: click an element → `buildAnchor()` (`src/core/anchor.ts`) captures selector candidates (`src/core/selector.ts`), a text fingerprint, and percentage offsets.
3. **Comment**: text via the explicit-save editor popup, or voice via the lazily-loaded module streaming Deepgram transcripts back through `VoiceHost.commit`.
4. **Persist**: `upsertComment()` → `saveStore()` (`src/core/storage.ts`) under `pinflow:c:<project>:<reviewer>`; `onChange` fires after each persisted mutation.
5. **Hydrate** (hosts with a backend): `config.source()` fetched once at identity resolution, merged by comment id (`mergeComments()`); server wins disposition, local-only/newer comments re-announce through `onChange` so sync losses self-heal.
6. **Re-render**: route changes (`src/core/router.ts` or host-driven `Handle.refreshRoute()`) close any open draft popup and re-scope pins to the current logical screen (`src/core/route-key.ts`, or host-supplied `config.routeKey`).
7. **Export**: `src/core/export.ts` renders reviewer/builder markdown and versioned JSON (also reachable via `Handle.exportMarkdown()/exportJSON()/downloadExport()` and the package-entry toolkit re-exports); comment text is untrusted input — blockquote escaping guards prompt injection when users paste exports into coding agents.

## Cross-cutting conventions

- **Singleton**: one active instance; re-`init()` destroys the previous one.
- **Generation guards**: `_generation` counters cancel in-flight async work (voice loads, late callbacks) across route changes and teardown.
- **`_`-prefix = mangled**: tsup mangles `/^_/` members; treat `_` renames as breaking.
- **Never throws on storage**: blocked localStorage degrades to an in-memory shim (`src/core/safe-storage.ts`) with a single console warning.

## Modes

- **reviewer** (default): one person's pins, scoped to their name.
- **builder**: aggregates all reviewers' stores read-only, with a per-reviewer drawer filter and combined export.
