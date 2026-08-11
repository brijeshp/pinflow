---
'@brijeshp/pinflow': patch
---

Mobile touch fixes: pin gestures no longer fight iOS text selection, and the marquee reaches touch via hold-then-drag.

**Selection and callout suppression.** On iOS every browser is WebKit, and a long-press starts text selection plus the Copy/Search callout on the same gesture pinflow uses to place a pin — a pin landed while the selection handles and callout bar came up with it, and the widget's own popup labels were selectable. Two layers fix it: the shadow UI is now unselectable chrome end to end (the draft textarea keeps selection — it is the one editable surface), and a document-level selection guard (constructed sheet, CSP-safe, `<style>` fallback) suppresses host selection and the callout while annotate mode is armed and for the duration of any stealth touch/pen press. The guard is modal and reversible — same category as the armed crosshair cursor — and never crosses into the shadow tree.

**Hold-then-drag touch marquee.** An immediate touch drag stays a native scroll — the platform decides ownership at gesture start, and pinflow never takes scrolling. But a finger that holds through the long-press threshold proves no scroll is in flight, so the hold now CLAIMS the gesture: the page dims around a zero-size marquee (the "you have it" cue), a non-passive `touchmove` keeps the scroller locked out, and the release disambiguates exactly like desktop Alt — release in place and it is a point pin, drag first and the drawn region commits as an area comment with `anchor.areaPercent`. Escape (hardware keyboards) and `pointercancel` abort cleanly, and every guarantee of the input-ownership pass carries over: the compatibility click and mouse burst after a touch gesture never reach the host.

One behavioural consequence: with the marquee available, a touch long-press opens the draft at RELEASE rather than at the hold threshold (the claim still beats the ~500 ms platform recognizer — same race, same winner, different prize). Without area callbacks configured, timer-fire activation is unchanged.

Size: the guard and the touch grammar cost ~290 B gz; core ceilings move to IIFE 17.95 KB / ESM 17.6 KB, razor-thin over linux CI actuals per the budget policy.
