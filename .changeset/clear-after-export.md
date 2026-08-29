---
'@brijeshp/pinflow': minor
---

Clearing your comments moved to after the export, where you can see whether it worked.

**The decision was being asked before its evidence existed.** The export sheet forked into `Export & share` and `Export & clear`, so a reviewer had to commit to wiping the corpus at the one moment nothing was known about delivery. That is not a hypothetical: `download()` fires a **detached** `a.click()` and returns `void` — no event, no promise — and it no-ops outright in some in-app webviews, which is exactly where the reviewer-on-a-phone moat puts people. `Export & clear` could therefore delete every comment on behalf of someone who received nothing, and `localStorage` was the only copy. The confirmation panel already exists _because_ that channel cannot be verified; offering the wipe on the surface that knows nothing, and withholding it from the surface that knows something, had it backwards.

**The sheet now has one action.** `Export & share` (plus `Send to builder` when `onSubmit` is configured). The two buttons were never peers anyway: both exported, one also deleted, so a superset was being presented as an alternative, with the destructive branch in neutral chrome one mis-tap from the primary.

**The confirmation gained the disposal.** `Clear comments` sits in its own row, quiet on the left, with `Done` carrying the accent on the right — the same grammar as the comment popup's delete/save row, so it is a vocabulary reviewers have already met rather than a new one. It takes two taps: the first arms it, renames it to `Clear 3 comments?`, tints it, and states the only thing anyone actually wants to know at that moment, which is that the file they just exported is unaffected. There is no undo, because deletes go out per-comment on the sync wire and PROTOCOL has no bulk reversal, so the friction belongs in front of the act.

**Clearing deliberately does not close the panel.** Both retries stay live and keep working afterwards, because they re-send the artifact that was already built rather than rebuilding from a store the wipe has just emptied. A reviewer who clears and only then notices nothing downloaded can still recover the file. Removing the safety net at the moment the data disappears would have made this change worse than the thing it replaces.

**Neither retry is the primary any more.** The download already fired on the way to this panel, so for most people the loudest button was a no-op repeat — and where it silently failed, firing the same detached click again does not rescue it; the body copy points at the clipboard instead. Finishing is the common path, so `Done` takes the accent.

The panel's status line is now an `aria-live="polite"` region. It carries the armed warning and the cleared confirmation, and it also fixes an existing silent failure: `Copy failed — use the download instead.` used to replace the body text with nothing announcing it.

Budget: the ceilings move up ~200 B as a deliberate trade and will be re-ratcheted razor-thin over the figure CI reports. Hoisting the `1 comment` / `3 comments` pluraliser out of `_sheetTitle` into a shared method paid ~20 B of the cost back across its three call sites.
