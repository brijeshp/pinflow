---
title: 'fix: CSP survival, heal correctness, and export honesty'
type: fix
status: active
date: 2026-08-06
origin: docs/brainstorms/2026-08-06-blast-radius-0.5.0-requirements.md
---

# 🐛 0.4.1 — CSP survival, heal correctness, and export honesty

## Overview

Four verified defects and one zero-byte addition, **carved out of the 0.5.0 plan so they ship this
week instead of waiting six weeks behind a scope-model sprint**. Every item is non-breaking, and
`git diff main...claude/peaceful-mclaren-c0d78e` confirms the two largest touch files the marquee
branch never opens (`src/core/selector.ts`, `src/core/ui/dom.ts`) — so this lands on `main` with
near-zero conflict against the branch.

Sibling plan: [`2026-08-06-001-feat-blast-radius-scope-model-plan.md`](./2026-08-06-001-feat-blast-radius-scope-model-plan.md) (0.5.0).
Origin: [`docs/brainstorms/2026-08-06-blast-radius-0.5.0-requirements.md`](../brainstorms/2026-08-06-blast-radius-0.5.0-requirements.md)
— R13, R14, R12's honesty half, R17.

**Why now rather than with 0.5.0.** R13 is the question every platform security reviewer asks and it
costs 40–70 B. R14's failure mode is _silently wrong_, which `selector.ts:19` itself calls "worse than
an honest orphan." R17 is zero core bytes and improves every artifact ever generated, including ones
already in the wild. None of the three needs the scope model to exist.

## Problem statement

### P1 — The widget dies silently under a strict CSP, fully non-interactive

`src/core/ui/dom.ts:16-18`:

```ts
const style = document.createElement('style');
style.textContent = STYLES;
shadow.appendChild(style);
```

HTML's "update a style block" algorithm invokes CSP's inline-style check on insertion, and a shadow
root gets **no CSP context of its own** — the document policy governs the whole tree. Under
`style-src 'self'` with no `'unsafe-inline'`, the stylesheet is dropped.

The failure is worse than "unstyled." `dom.ts:13-14` sets `pointer-events: none` on the host **via
CSSOM**, which CSP does _not_ restrict, while `pointer-events: auto` for `.control`, `.chip`, `.pin`,
`.panel`, `.input` and `.drawer` lives **only** in the blocked stylesheet. Result: an invisible,
completely non-interactive overlay. Every pin and button dead, no error.

### P2 — The heal ladder is silently wrong, and unboundedly slow

Three defects in `src/core/selector.ts`, all on the same path:

- **Positional rungs win over contradicting text.** `css` (`:148`) runs before the fingerprint rung
  (`:168`), so on a virtualised list or infinite scroll a recycled node satisfying a stale
  `div:nth-of-type(3)` resolves confidently. A pin on "Order #1042" re-attaches to "Order #7781."
- **`getTextFingerprint` normalises the entire subtree before slicing to 80 chars** (`:122-124`).
  Measured (Chromium, amortised, median of 9): **97 µs desktop / 640 µs at 6× CPU throttle** on a
  33 kB anchor. Forty pins on 27 kB containers is **3.1 ms / 20 ms per frame — 5× the budget.**
- **The walk starts at the document root and fingerprints `<head>`.** The counter increments in the
  loop _condition_ (`:182`) before the `HTML`/`BODY`/`HEAD` skip at `:185`, and only those three tags
  are skipped — so every `<meta>`, `<link>`, `<style>` and `<script>` is a scored candidate.
  Measured: 55 µs / 360 µs and 45 of the 2,000 slots on a page with 40 preloads. **And
  `getTextFingerprint(<title>)` returns `"Checkout"` — an exact-match candidate that would heal a pin
  on a "Checkout" heading to `<title>`.** That is a correctness bug, not just waste.

### P3 — The confirmation panel asserts a download that may not have happened

`src/core/download.ts:1-13` fires a **deliberately detached** `a.click()` on a blob URL and returns
`void`. In iOS in-app webviews (Instagram, LinkedIn, Slack, Facebook) that frequently no-ops. Success
is **not observable in general** — there is no event, no promise.

`annotator.ts:1417` renders `this._makePanel('Saved to your downloads', body, buttons)`
**unconditionally**. So in the exact environment the moat targets, Pinflow asserts a file was saved
when nothing happened. (The clipboard half is already honest — `:1400` suppresses "Copied to clipboard
too" on failure. The title is the lie.)

### P4 — Two live escaping holes in `export.ts`

Both contained today (no block structure is fabricated), both must be fixed **before** 0.5.0's shared
`nodeLabel()` multiplies the exposure across five new line types.

- **`tagFromCss()` uses `inline()` where it needs `code()`** (`:38-42`). With the hostile input already
  in the test corpus, `` `<body` >` `` — the code span closes early. The existing assertion at
  `tests/core/export.test.ts:412` passes for the wrong reason.
- **A `"` inside a testid forges an attribute.** `code()` does not touch double quotes, so
  `code('pro" x="y')` → `data-testid="pro" x="y"`. An agent extracting `data-testid="([^"]*)"` reads
  `pro` and sees a fabricated second attribute.

### P5 — The artifact carries no reading protocol, and every existing export lacks one

"Export is descriptive, not instructional" is a named gap. The naive fix adds a preamble to every
export, costing core bytes. Shipping the protocol as a pack in the tarball costs **zero** and
retroactively improves artifacts already generated.

## Proposed solution

| #   | Fix                                                                                                                                                                                     |    Bytes |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: |
| P1  | Constructed `CSSStyleSheet` + `replaceSync()` via `shadow.adoptedStyleSheets`, `<style>` retained as a **mandatory** fallback behind lazy `try`-guarded detection                       | +40–70 B |
| P2a | `.slice(0, 400)` before `.replace()` in `getTextFingerprint` — 80 chars out can never need more than ~400 in                                                                            |     ~0 B |
| P2b | Seed the walker at `document.body`; extend the tag skip list (`SCRIPT, STYLE, LINK, META, TITLE, NOSCRIPT, TEMPLATE, BR, WBR, OPTION, TRACK, SOURCE`) **before** the counter increments |    +45 B |
| P2c | Verify-before-trust: a positional hit whose fingerprint contradicts a stored one ≥ `FUZZY_MIN_FP` is rejected in favour of the text match                                               |    +90 B |
| P2d | Replace the pure count cap with count-OR-`performance.now()` — 2,000 nodes is 1.5 ms on a laptop and **9.5 ms on a phone**                                                              |    +35 B |
| P2e | Subtree-restrict after the first exact match (the code's own containment rule at `:191` already implies only descendants can replace it)                                                |    +40 B |
| P3  | Panel title becomes non-committal; the truth lives in the clipboard/last-resort state                                                                                                   |   ~−20 B |
| P4  | `code()` on the tag; new `attr()` helper = `code(v).replace(/"/g, "'")` for every `data-testid=` / `id=` interpolation                                                                  |    +25 B |
| P5  | `agent/` in the npm tarball; `files` array addition                                                                                                                                     |      0 B |

**P2 must ship as a unit.** Verify-before-trust (P2c) alone makes the fingerprint walk run on every
successful positional resolve — without P2a it is a 5× budget regression, and without P2d it is
device-dependent.

**Environment sniffing for P3 is rejected.** UA heuristics for in-app webviews are fragile and wrong in
both directions. Never assert what the widget did not observe.

## System-wide impact

- **Interaction graph.** P1 changes only how the stylesheet is attached; the shadow root, host inline
  styles, and every selector are untouched. P2 sits entirely behind `resolveAnchor`'s existing
  signature — no caller changes. P3 is one string. P4 is two helpers in a DOM-free module.
- **Error propagation.** P1's detection must be **lazy** (not module-scope) so an SSR/Node import never
  throws, and inside `try` — pre-Safari-16.4 throws `TypeError: Illegal constructor`. Probe
  `cssRules.length` after `replaceSync` to catch no-op stubs.
- **State lifecycle.** P2c makes fallback-chain resolves common by design. `_persistHeal`
  (`annotator.ts:544-571`) calls `saveStore` — a synchronous whole-store `JSON.stringify` +
  `setItem` — from inside `_repositionPins` (`:1347`). **Gate it behind the existing `_orphanRetryAt`
  throttle (`:1336-1338`), which today covers only the orphan path**, or a whole-store write lands in a
  scroll frame.
- **API surface parity.** No public signature changes. No schema change. `SCHEMA_VERSION` stays 3.
- **Support floor.** `adoptedStyleSheets`: Chrome 73 / Firefox 101 / **Safari 16.4** (Mar 2023),
  Baseline widely available since ~Sept 2025. The `<style>` fallback covers everything older.
- **`@import` is silently dropped by `replaceSync`** — `STYLES` contains none; assert it stays that way.
- **Docs.** README (CSP note), wiki `core.md` + `build-and-release.md` via the wiki-update playbook,
  changeset (patch). **Also tighten `AGENTS.md`'s `_`-prefix invariant** — see below.

### One `AGENTS.md` change that belongs here, not in 0.5.0

Current wording says a `_` rename is a semantic change. It must also say: **a `_` prefix on a persisted
key is data corruption.** Three esbuild probes with this repo's own `mangleProps: /^_/` established
that quoted access (`v['_x']` — the only way `storage.ts` can read untrusted input) is not mangled
while dotted access is; that mangled names are frequency-derived **per entry point**, and
`tsup.config.ts` builds `index.ts` and `iife.ts` as separate passes writing the same localStorage key;
and that `dts: true` is a separate rollup pass that never sees `mangleProps`, so the `.d.ts` would
declare `_x` while the runtime emits `t` — and `tests/types/packed-consumer.test.ts` would still pass.

Landing the invariant in 0.4.1 means 0.5.0's schema work starts with the guardrail already in place.

## Testing notes

**happy-dom, not jsdom** (`vitest.config.ts`). Three facts shape these tests, all probed:

- `getBoundingClientRect()` returns an **all-zero** DOMRect.
- `getClientRects()` returns **length 1 for every element, including `display:none`**.
- `new CSSStyleSheet()` **succeeds** and `document.adoptedStyleSheets` exists — so happy-dom always
  takes the constructed path.

That last one is why **P1's styling strategy must be injectable**: unit tests assert _which branch was
chosen_, and the real CSSOM path is covered in `pnpm test:e2e`. Do not let environment fidelity decide
whether styling code counts toward the 80 % `src/core/**` gate.
(The 0.5.0 draft cited jsdom#3998 for this; the conclusion holds, the citation was about a runner this
repo does not use.)

## Integration test scenarios

1. Page served with `Content-Security-Policy: style-src 'self'` and no `'unsafe-inline'`: widget
   renders **and is interactive** — place a pin, open the composer, export. Live browser, not unit.
2. Same page in a Safari <16.4 emulation (or with `CSSStyleSheet` stubbed to throw): falls back to
   `<style>`, and the failure is the pre-existing one, not a crash.
3. Virtualised list: pin row 3, scroll so the DOM node recycles with different content, reposition.
   Assert **orphan**, not a confidently wrong element.
4. 400-row list page: 40 pins, scroll profile. Assert no `selector.ts` frames and the reflow
   call-count guards hold.
5. `a.click()` stubbed to a no-op: the confirmation never claims the file was saved.
6. Hostile page fixture (the corpus at `tests/core/export.test.ts:412` plus the two P4 inputs): no
   fabricated headings, no unbalanced code spans, exactly one `data-testid=` per element label.

## Acceptance criteria

### Functional

- [ ] Widget fully interactive under `style-src 'self'` — **live browser proof**, not a unit test.
- [ ] Falls back to `<style>` when `new CSSStyleSheet()` throws, with no console error.
- [ ] A recycled DOM node satisfying a stale positional selector produces an orphan, not a wrong match.
- [ ] `getTextFingerprint` on a 33 kB anchor completes in < 5 µs (was 97 µs).
- [ ] The fingerprint walk never enters `<head>`; `<title>` can never be an exact-match candidate.
- [ ] A single heal walk is time-bounded and behaves identically under 6× CPU throttle.
- [ ] `_persistHeal`'s `saveStore` is throttled by `_orphanRetryAt`; a scroll sequence produces at most
      one storage write per healed comment, never one per frame.
- [ ] No code path renders a success assertion the widget did not observe — test stubs `a.click()` to a
      no-op and asserts the rendered title.
- [ ] `agent/` ships in the tarball and its protocol matches the v3 export format exactly.

### Non-functional

- [ ] TDD throughout, **every test traced to fail against pre-fix code**, stated in the commit trailer
      (`TDD: N tests RED first; M unit + K e2e green.`).
- [ ] Coverage gate holds (≥80 % lines/functions/statements, ≥75 % branches on `src/core/**`) **with
      `src/core/ui/**` included\*\*.
- [ ] `pnpm size` green; ceiling notched from 14.55/14.2 to **15.0/14.65** and re-ratcheted to
      **linux-CI actuals** — CI has undershot the macOS measurement twice (`8cb7bc0`, `b83ceb7`).
- [ ] Patch changeset present; `AGENTS.md` `_`-prefix invariant tightened.
- [ ] No breaking change. `SCHEMA_VERSION` unchanged at 3. No public signature changes.
- [ ] Wiki re-synced as the **last step**, in its own commit — never amend a commit the marker points at
      (`466e83f`, `1d76243` are the repair commits).

## Implementation phases

1. **P4 + `AGENTS.md`** — smallest, and P4 must precede any `nodeLabel` work in 0.5.0.
2. **P1 CSP** — injectable strategy, detection, fallback, live-browser proof.
3. **P2 heal** — a–e together, with the reflow guards extended first so a regression is caught by test
   rather than by review.
4. **P3** — one string plus its test.
5. **P5 agent pack** — `agent/` content against the v3 format, `files` array.
6. **Release** — byte-golf, re-ratchet to CI actuals, changeset, wiki sync, review round to APPROVED.

## Sources & references

- CSP: `src/core/ui/dom.ts:13-18`; [CSP Level 3](https://w3c.github.io/webappsec-csp/) has no hook for
  `CSSStyleSheet`/`replaceSync`/`adoptedStyleSheets`;
  [MDN `style-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src)
  names only `insertRule`/`cssText` as reserved and notes no browser blocks them.
- Heal: `src/core/selector.ts:122-124` (fingerprint), `:135-213` (ladder), `:182-188` (walk counter and
  skip order), `:191` (containment rule enabling P2e).
- Export honesty: `src/core/download.ts:1-27`, `src/core/ui/annotator.ts:1355,1400,1417`.
- Escaping: `src/core/export.ts:10-28` (never-weaken contract), `:38-42` (`tagFromCss`).
- Perf guards to extend: `tests/core/annotator-reflow.test.ts` (P2.1/P2.2 call-count assertions).
- Budget procedure: notch at release-prep with margin, re-ratchet to CI actuals — `2a620c3` → `78aae5b`.
- Agent-pack precedent: `.claude/skills/wiki-update/SKILL.md` is deliberately plain markdown so any
  agent can execute it.
