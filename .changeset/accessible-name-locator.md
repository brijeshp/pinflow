---
'@brijeshp/pinflow': minor
---

Context names what the reviewer saw on screen, and the same name is a locator rung a rebuild cannot kill.

**"the input under ‘Bill-led Group Session 1’" is now "the ‘All Attended’ checkbox under ‘Bill-led Group Session 1’".** `buildAnchor` named an element by aria-label, then alt, then its text fingerprint — so a checkbox whose name came from an associated `<label>` or `aria-labelledby` exported with no name at all, and every `<input>` was "input". A shared `accessibleName()` ladder (aria-label → aria-labelledby → associated `<label>` → alt → title) and `roleOf()` (explicit role, else a small implicit map: checkbox, radio, slider, textbox, combobox, link, button…) feed the Context line. Never text content: the fingerprint owns text.

**A role-and-name rung between `id` and `css`.** On an app built with CSS modules, every class in the css path is a build hash (`_actions_14nag_95`) that the next build replaces, and hosts will not put `data-testid` on every control. The page already carries `role="switch"` + "Spoke for Alfred Hart". `SelectorCandidates` gains `role` and `name` (additive; present only when a name exists), the export lists them as `- role: \`switch\` named ‘Spoke for Alfred Hart’`before`css`, and `findByCandidates` resolves by them when the match is unique. Ambiguous names — twelve identical "Remove" buttons — only corroborate a positional hit and never pick the first; the ladder otherwise continues as before. The agent reading-protocol files list the rung in its place.

Budget: the core ceilings move UP as a deliberate trade — 24.55 → 25.15 KB gz (IIFE) and 24.4 → 25.0 KB (ESM), set generously. All three moves in this release (this one, the dialog layer, the clear row) are to be re-ratcheted to the figures CI reports plus ~50 B in one follow-up commit, per `docs/wiki/build-and-release.md`.
