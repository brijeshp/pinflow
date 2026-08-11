---
'@brijeshp/pinflow': minor
---

Export confirmation offers both channels as actions; the email hand-off is removed.

**The panel now acts instead of apologising.** Exporting still downloads the Markdown and copies it to the clipboard on the way through. The confirmation then offers both again as buttons — **Download Feedback Markdown** (primary) and **Copy to Clipboard** — plus **Done**. This matters because one of those channels cannot be verified: `download()` fires a detached `a.click()` that returns `void`, and it no-ops outright in some in-app webviews, which is exactly where a reviewer on a phone ends up. The old panel could only describe that failure in prose; now the reviewer has a button. The body copy still asserts only the clipboard, the one result the widget can observe, and the retry reports honestly — `Copied to your clipboard.` or `Copy failed — use the download instead.`

**Breaking: `config.submitTo` is removed.** It existed solely to add an "Email it to the builder" `mailto:` button to that panel. Drafting an email was never a good fit for the moment — Pinflow does not know who the reviewer is beyond a display name, and the recipient was the host's guess, so the action opened an empty draft the reviewer had to finish by hand. Hosts that need a submission channel should use `onSubmit` (host-owned function) or `onChange`/`source` (backend sync); everyone else shares the file or the clipboard however the team already works. The Vue wrapper's `submitTo` prop is removed with it.

Panel button rows now wrap instead of squeezing. `flex:1` gave every button an equal share of a 320px panel, so the longer primary label collapsed into a three-line stack; buttons now size from content with a floor, and a row that does not fit breaks — the primary takes its own line and the rest share the next. Two-button rows (the export sheet) are unchanged.

Removing the `mailto:` construction frees more than the two buttons and the wrap rule cost, so this change is size-negative on its own; the net ceiling movement for the release is accounted for in the input-ownership changeset.
