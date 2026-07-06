# Voice module & the core↔voice seam

The voice module is optional and lazily loaded so text-only users pay 0 bytes. The core↔voice isolation seam is an architectural invariant: voice code must never be imported directly from core. Activation, failure handling, and the resumption handshake between recording and text fallback all enforce this boundary.

## Lazy loading & the externalization contract

Voice loads on demand via `src/core/voice-loader.ts` `loadVoice()`, a dynamic import of the `pinflow/voice` specifier marked `external` in `tsup.config.ts` (both ESM and IIFE configs). Consequences:

- Core bundles (`dist/index.js`, `dist/pinflow.iife.js`) never include voice code; the import stays a runtime reference.
- `tsup.config.ts` sets `external: ['pinflow/voice']` so the seam holds across all output formats.
- `tests/voice/bundle-isolation.test.ts` asserts core bundles contain no voice symbols (getUserMedia, AudioContext, Deepgram API calls).
- On the ESM path, the consumer's bundler resolves `pinflow/voice` via the package exports map. On the IIFE/CDN path the import fails gracefully and the caller degrades to text; a dedicated CDN voice loader is deferred.

The contract lives in `src/core/voice-contract.ts`:

- `VoiceHost` — the narrow port core hands voice: mount element, config, anchor, and three callbacks (`commit`, `discard`, `degradeToText`).
- `VoiceSession` — one live recording with idempotent `stop()` and `dispose()`.
- `VoiceModule` — the default export shape: `{ start(host: VoiceHost): Promise<VoiceSession> }`.

`voice-loader.ts` hardens against bad/missing modules: it accepts ESM defaults or CJS-shaped namespaces, and rejects cleanly if `start` is absent.

## Activation & the voice flow

Voice activation happens in `src/core/ui/annotator.ts` `_startVoiceDot()`:

1. **Dot placement:** a fixed-position mount element is dropped near the click (320×140 area, flipped to stay in viewport).
2. **Lazy module load:** `_loadVoiceModule()`; generation guards (`myGen`) detect teardown or route change while the import is in flight.
3. **Session start:** `VoiceModule.start(host)`; on success the session is held in `_activeVoice.session` for lifecycle management.
4. **Failure degradation:** any error at module load, socket open, or mic capture falls back to `host.degradeToText()`, which opens a text editor (respecting the frozen route if the route changed mid-recording).

## Microphone capture & streaming

`src/voice/capture/audio.ts` `createAudioCapture()`:

- **getUserMedia:** audio with echoCancellation and noiseSuppression, `channelCount: 1`.
- **AudioWorklet:** `src/voice/capture/worklet.ts` ships as a Blob-URL string loaded via `ctx.audioWorklet.addModule()`. It downsamples the AudioContext's native rate (typically 48 kHz) to 16 kHz mono linear16 PCM, emitting transferable ArrayBuffers off the main thread (ratio = sampleRate / 16000; samples clamped to [-1, 1] then scaled to Int16).
- **Waveform levels:** an AnalyserNode samples 5-band frequency data on a parallel rAF loop, feeding the 5-bar visual in `src/voice/ui/dot.ts`.
- **Cleanup:** `stop()` releases mic tracks (OS indicator clears), closes the AudioContext, detaches the worklet, cancels rAF, revokes the Blob URL — every acquired resource is released even on partial failure.

## Deepgram streaming & WebSocket lifecycle

`src/voice/transcription/deepgram.ts` `createDeepgramProvider()`:

- **Auth:** short-lived grant-token JWT passed via the `['token', jwt]` WebSocket subprotocol (browsers can't set Authorization headers). Token resolution order in `src/voice/index.ts`: `getToken` → `tokenEndpoint` → `devOnlyToken`.
- **Handshake:** 10-second open timeout; pre-open failures both reject the promise and close the socket.
- **Keepalive:** 4-second interval frame to prevent inactivity timeout.
- **Finalize:** `stop()` sends a finalize frame and waits for the `from_finalize` ack in Results, with a 1-second fallback timeout — captures the sentence tail on slow links.
- **Close:** detaches all handlers before closing to avoid spurious errors after teardown.
- **Errors:** pre-open errors reject; post-open errors surface through the provider's `onError`.

The provider emits `onInterim` (live, replaceable) and `onFinal` (appended, immutable). `src/voice/transcript-store.ts` `TranscriptStore` enforces the invariants: finals append (so "tap to add more" works); late interims/finals are dropped after `beginFinalize()` or close.

## Failure handling & degradation

The session orchestrator in `src/voice/session.ts` `startSession()` chains provider open and mic capture with generation guards:

- **Provider failure:** rejects immediately → `degradeToText()` → returns a noop session.
- **Mic failure** (permissions denied, CSP-blocked worklet): idempotent `capture.stop()` releases partially-acquired resources, closes the stream, degrades, returns a noop session.
- **Disposition:** on successful `stop()`, the transcript finalizes and commits. On `dispose()` (annotator teardown), committed finals plus any pending interim tail are best-effort persisted with `VoiceMeta.interim` set (the tail is persisted only when non-empty).
- `minConfidence` aggregates as the minimum across all finals — the pessimistic value for downstream consumers.

## Core↔voice async resumption

`TranscriptStore` states:

- **recording:** interims and finals accepted, rendered live.
- **finalizing:** interims ignored; provider-tail finals still land (finalize blocks until ack or timeout).
- **closed:** all input dropped.

`session.stop()` and `dispose()` are idempotent, guaranteeing exactly-once persistence. On the core side, the Annotator's generation guards prevent late resolutions from touching storage or DOM post-destroy, and the **route frozen at dot creation** is the one the comment persists to.

## What an agent must NOT do here

- ❌ Import voice from core: `import ... from 'pinflow/voice'` anywhere in `src/core/**` other than the dynamic import inside `voice-loader.ts`.
- ❌ Value-imports of voice types in core — use `import type` (as `voice-contract.ts` does); type-only imports are erased at compile time.
- ❌ Re-export voice values from `src/core/index.ts` (breaks the externalization contract).
- ❌ Rename `_`-prefixed members (tsup mangles `/^_/`) — treat as breaking.
- After ANY change near the seam: run `pnpm build && pnpm size` and `pnpm vitest run tests/voice/bundle-isolation.test.ts`.
