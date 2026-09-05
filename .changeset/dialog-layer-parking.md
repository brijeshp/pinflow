---
'@brijeshp/pinflow': minor
---

A pin taken inside a modal is bound to that dialog, and parks when the dialog closes.

**The heal ladder was undoing the guide's promise.** A removed element is supposed to hide its pin. A dialog unmounting is the common case of "removed", and the ladder — css, xpath, then the fingerprint walk — found whatever was left in the tree: the session header, `main`, or an `nth-of-type` sibling inside the next modal that opened. `_persistHeal` then wrote that stranger into the stored selectors, so the next load corroborated it trivially and the original anchor was gone for good. Exports told the agent the header was the transcript.

`buildAnchor` now records `anchor.layer` — the nearest `role="dialog"`, `role="alertdialog"`, `aria-modal="true"`, or open `<dialog>` ancestor, named by its accessible name (aria-label, aria-labelledby, else its first heading). `resolveAnchor` runs the ladder only inside an open dialog of that name and accepts a hit only if the dialog contains it. No such dialog, or no hit inside one, parks the pin; it never falls through to the page. Reopen the dialog and the pin returns. `PROTOCOL.md` documents the field as additive; a malformed one drops the record like any anchor corruption.

**Pins now follow the host's re-render, not the reviewer's scroll.** Reflow ran on scroll and resize only, so a pin whose element had left the DOM kept its last screen position over whatever the overlay had covered. A `MutationObserver` on `document.body` now routes through the same rAF throttle. Parked pins still retry at most once per 500 ms, but a pass that skips them because of that gate now schedules one deferred pass for when it expires — a dialog reopening a moment after it closed used to stay parked until the next unrelated scroll.

The export gains a `**Layer:** dialog ‘Add Patients’` line after Context, and `(parked)` under Orphaned comments — the dialog was closed, or its contents changed; the artifact does not claim which. The agent reading-protocol files say to open that dialog first.

Deferred, not forgotten: the "3 notes on Add Patients — open it to see them" chip, clipping a pin to its dialog while open, and a layer-aware scope walk.

Budget: the core ceilings move UP as a deliberate trade for the layer binding and the mutation trigger — 24.15 → 24.55 KB gz (IIFE) and 24.0 → 24.4 KB (ESM), set generously on top of the previous feature's still-unratcheted ceilings. Both are to be re-ratcheted to the figure CI reports plus ~50 B in one follow-up commit, per `docs/wiki/build-and-release.md`.
