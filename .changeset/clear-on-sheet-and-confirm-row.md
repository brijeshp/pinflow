---
'@brijeshp/pinflow': minor
---

The export sheet offers a clear again, and an armed clear now reads as a question with two answers.

**Clear is available before exporting, not only after.** 0.11.0 removed the wipe from the sheet because `Export & clear` asked for the disposal decision before either channel had run. The decision is now its own control beside `Export & share` — never an export variant — with the same two-tap, revision-scoped machinery as the confirmation's, and an armed line that says plainly that nothing is exported first. A wipe that empties the corpus closes the sheet, since nothing is left to export.

**The armed state no longer relies on the label alone.** The first tap used to turn the quiet text control into `Clear N comments?` and leave the accented `Done` standing beside it. Reviewers read the label as a prompt and answered it by pressing `Done` — which finished without clearing. Arming now hides the panel's primary (`Export & share` on the sheet, `Done` on the confirmation), shows a `Keep` button, and turns the control into a filled destructive `Clear N comments` in the primary's place. `Keep` backs out and returns focus to the resting control; every existing disarm path — a tap anywhere else, Tabbing out, any other panel action — still works, and the one-gesture swallow window and per-comment sync deletes are unchanged.

Arming on the sheet chains the sheet's own outside-dismiss into the armed disposer rather than replacing it, so exporting from an armed sheet cannot leave a stale listener that would close the confirmation on the next host tap.

Budget: the core ceilings move UP as a deliberate trade for the second clear surface and the Keep control — 23.87 → 24.15 KB gz (IIFE) and 23.72 → 24.0 KB (ESM). Set generously first; to be re-ratcheted to the figure CI reports plus ~50 B in a follow-up commit, per `docs/wiki/build-and-release.md`.
