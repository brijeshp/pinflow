---
'@brijeshp/pinflow': minor
---

Nobody is asked who they are at page load; the export sheet asks instead, and the name is optional.

**The `window.prompt` at init is gone.** A first-time reviewer met an unexplained OS dialog before they had read a word of the page — on a phone it reads as a broken site, and in a sandboxed iframe without `allow-modals` (Lovable, Bolt, StackBlitz, CodeSandbox — where these prototypes actually live) `prompt()` throws rather than returning null. A dismissed or blocked dialog produced an inert handle, and because that early return preceded the boot line, it printed _nothing to the console_: indistinguishable from a widget that never loaded. Reviewers now get a minted handle (`anon_…`) and a corpus of their own, silently.

**The export sheet carries an optional name field.** It is the one moment attribution matters and the only one where the reviewer has any context for the question. Prefilled if they have named themselves before, skippable, and Enter exports. Naming yourself **moves your comments**: the storage key embeds the reviewer (`pinflow:c:<project>:<reviewer>`), so this is a key move, not a field edit — copy-then-delete, so a refused write leaves the comments exactly where they were. Naming yourself something you have used before on that browser folds the two sets together instead of shadowing one.

**An unnamed export claims no author.** The minted handle is a storage key, not a person, so it never reaches the artifact: the heading is `# Feedback for <project>` with no `— from`, there is no `Reviewer:` line, and the filename drops the who segment (`pinflow-feedback-<project>-<ts>.md`) without borrowing the builder aggregate's label. Previously every export from a host that set `config.reviewer` to a placeholder carried that placeholder — several reviewers' files would all land in one downloads folder under the same name.

Existing reviewers are unaffected: a name already remembered under `pinflow:r:<project>` still wins over minting, so their identity and their comments stay put.

Core grows ~275 B (17.87 kB ESM gz), an approved trade against ceilings raised to 17.95 kB ESM / 18.32 kB IIFE.
