---
'@brijeshp/pinflow': patch
---

The export confirmation no longer claims a file was saved when it may not have
been. Downloading fires a detached anchor click and returns nothing — there is
no event and no promise, so a completed save is not observable. In iOS in-app
webviews (Instagram, LinkedIn, Slack) it frequently does nothing at all, which
is exactly where a reviewer following a shared link ends up, and the panel
announced "Saved to your downloads" regardless.

The panel now states only what was verified. When the clipboard write succeeded
it says so and offers pasting as the recovery if no file appeared; when it did
not, it points the reviewer at their downloads without asserting the file is
there. With `submitTo` configured and no clipboard, the hand-off now tells the
reviewer to attach the downloaded file — previously it opened an empty email
with nothing to paste and nothing to attach.
