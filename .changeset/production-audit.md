---
'pinflow': patch
---

Production audit hardening (34-finding external review, all resolved):

- **Export escaping covers every interpolated field** — reviewer names, routes, ids, selectors, resolutions, context, `describeRoute` labels, and bare `\r` are neutralized, not just comment text. Locked by hostile-input tests.
- **Lifecycle correctness**: source hydration survives SPA navigation; a mid-edit hydration that resolves a comment discards the stale edit; async `onChange`/`onSubmit` rejections are contained; late clipboard results can't resurrect stale panels; nested scroll containers reposition pins; initially-orphaned pins heal (bounded retry) when their element mounts late.
- **Voice**: startup is abortable (no socket or mic for a torn-down instance); stop/dispose races persist transcripts exactly once; a mid-recording provider error salvages the transcript and releases the mic; the worklet flushes partial buffers on stop and no longer attenuates amplitude at fractional sample-rate ratios.
- **Storage**: write-probe acquisition (Safari-private read-only stores get the memory shim up front); URI-encoded key components (colon-bearing names cannot alias another namespace) with legacy read fallback; deep numeric anchor validation.
- **Wrappers**: React function props (`onChange`, `onSubmit`, `source`, `routeKey`, `describeRoute`) delegate to the latest render — no stale closures; `PinflowTheme` exported from the root.
- **Builder mode is functional**: reviewer checkboxes filter pins; pins open a read-only view with attribution and disposition.
- **A11y/platform**: pins are real buttons with accessible names; `prefers-reduced-motion` honored; `.root` font stack survives `all:initial` quirks; the export hotkey leaves the chord to the host when pinflow won't act.
- **Public API**: `routeOf` now strips pinflow params exactly like the default route key (documented behavior).

Budgets re-ratcheted to the audited actuals: core ESM 13.1 KB, IIFE 13.45 KB, voice 4.45 KB, react wrapper 0.47 KB (gz) — the measured cost of the correctness work above across both certification rounds.
