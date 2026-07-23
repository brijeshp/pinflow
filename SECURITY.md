# Security policy

## Reporting a vulnerability

Please report security issues privately to **brijeshp@gmail.com** with the
subject line `pinflow security`. You will get an acknowledgement within 72
hours. Please do not open public issues for suspected vulnerabilities.

## Scope notes for reviewers

- Pinflow has **zero runtime dependencies** and **no telemetry**; the only
  network calls are host-configured (`source`, `onChange` targets, and the
  Deepgram WebSocket when voice is explicitly enabled).
- Exported markdown treats every reviewer-authored and host-supplied field as
  untrusted; the escaping in `src/core/export.ts` is a hard invariant with a
  regression suite (`tests/core/export.test.ts`) — weakening it is a
  vulnerability by definition.
- `voice.devOnlyToken` is refused off local origins by design; grant tokens
  are never persisted, logged, or placed in URLs.
