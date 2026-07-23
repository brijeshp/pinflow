---
'pinflow': minor
---

Anytime export: a summonable export affordance in every mode, not just at the end.

- **Count chip** (reviewer mode): a small circle in the pins' visual vocabulary, bottom-left, appearing once the reviewer has a comment. Tapping it summons an anchored export sheet (`n comments · m screens` + **Export & share**) wired to the standard flow — download + clipboard + the `submitTo` mailto hand-off. Dismissed by chip toggle or a completed outside tap (pinch/scroll never dismisses).
- **Draft popup action**: `Export all · n` in the comment popup — saves your draft first, then opens the sheet. Frozen (resolved) popups are unaffected.
- **Hotkey**: `⌘/Ctrl+Shift+E` opens the sheet on desktop.
- **`exportUi` config** (`'auto' | 'always' | 'never'`, default `'auto'`): on for local-first installs, off automatically when `source` is configured (a synced host owns collation). Builder mode is unchanged — its drawer already exports anytime.

Core budgets ratcheted for the feature: ESM 12.15 KB, IIFE 12.5 KB (gz); ~0.65 KB actual cost including the review-hardening pass (surface-state tracking, lossless draft handling, anchor fallbacks).
