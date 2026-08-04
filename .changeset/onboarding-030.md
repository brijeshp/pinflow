---
'@brijeshp/pinflow': minor
---

The 0.3.0 onboarding release — every item traces to the first external user's
feedback session:

- **Activation defaults to `'both'`** (breaking): Alt+click (Windows/Linux:
  Alt; macOS: ⌥) and 500 ms long-press work with zero config, alongside the
  button. Pass `activation: { mode: 'toggle' }` to restore the old default.
- **Two-step pinning**: the control button itself arms annotate mode (button,
  then page) — the "Add comment" middle step is gone. Placing a pin closes
  the menu; a second control click is a full stop.
- **Fail-loud boot**: one `console.info` ready line (version, mode,
  activation, comment count) on success; `console.error` before rethrow on
  init failure. Inert paths (SSR, declined identity) stay silent.
- **Fuzzy re-anchor**: when every exact candidate misses, a Dice-similarity
  pass (≥0.6, same-tag bias) re-attaches lightly reworded elements instead of
  orphaning; successful heals persist rebuilt selectors so the next load
  matches exactly. Unrecognizable content stays an honest orphan.
- **Orphans hide** instead of floating gray mid-page; the export sheet
  reports "· n unanchored" and heals un-hide.
- **Reviewer batch controls**: "Clear all" (confirm surface) in the menu and
  "Export & clear" in the sheet; every removal emits its own `onChange`
  delete so synced hosts stay consistent.
- Hardening found by the new flow: armed clicks on pinflow's own UI are
  guarded via composedPath, and `download()` clicks a detached anchor (an
  attached one re-entered the armed handler and could place a bogus pin).

The fingerprint fallback walk no longer early-returns on the first exact
match — it completes its (still 2000-element-capped) scan so containment
chains resolve to the deepest element. Slightly more work on a last-ditch
path, traded for never pinning a wrapper.

Core ceilings notched for the feature set: IIFE 14.3 / ESM 13.95 KB gz
(features +0.60 KB, review-round hardening ~+0.15 KB; margin covers linux-CI
gzip drift).
