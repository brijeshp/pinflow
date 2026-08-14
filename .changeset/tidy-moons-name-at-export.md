---
'@brijeshp/pinflow': minor
---

Nobody is asked who they are at page load; the export sheet asks instead, and the name is optional.

**The `window.prompt` at init is gone.** A first-time reviewer met an unexplained OS dialog before they had read a word of the page — on a phone it reads as a broken site, and in a sandboxed iframe without `allow-modals` (Lovable, Bolt, StackBlitz, CodeSandbox — where these prototypes actually live) `prompt()` throws rather than returning null. A dismissed or blocked dialog produced an inert handle, and because that early return preceded the boot line, it printed _nothing to the console_: indistinguishable from a widget that never loaded. Reviewers now get a minted handle (`anon_…`) and a corpus of their own, silently.

**The export sheet carries an optional name field.** It is the one moment attribution matters and the only one where the reviewer has any context for the question. Prefilled if they have named themselves before, skippable, and Enter exports. Naming yourself **moves your comments**: the storage key embeds the reviewer (`pinflow:c:<project>:<reviewer>`), so this is a key move, not a field edit — copy-then-delete, so a refused write leaves the comments exactly where they were. Naming yourself something you have used before on that browser folds the two sets together instead of shadowing one.

**An unnamed export claims no author.** The minted handle is a storage key, not a person, so it never reaches an artifact: the heading is `# Feedback for <project>` with no `— from`, there is no `Reviewer:` line, and the filename drops the who segment (`pinflow-feedback-<project>-<ts>.md`) without borrowing the builder aggregate's label. Previously every export from a host that set `config.reviewer` to a placeholder carried that placeholder — several reviewers' files would all land in one downloads folder under the same name.

That rule now lives in one exported function, `attribution()` in `src/core/export.ts`, and every public entry point obeys it: `exportReviewer`, `exportFilename`, and single-store `exportJSON`, including the toolkit re-exports hosts run server-side. The builder aggregate (`exportJSON` with an array) deliberately keeps raw handles so two unnamed reviewers stay distinguishable.

**Clearing the name field is an export-scoped opt-out.** The field says it is included in the export, so emptying it removes attribution from that artifact — without renaming anything or disturbing the identity the corpus is filed under. The confirmation panel's retry buttons re-send the artifact that was already built rather than rebuilding it, so they cannot resurrect a name the reviewer just removed.

**Send to builder settles the name too.** It is the sheet's other terminal action and equivalent to Export & share by contract, so `onSubmit` now receives the typed name rather than the handle it replaced.

**Breaking, for direct callers of `exportFilename`:** passing `''` used to produce the builder aggregate name (`<project>-aggregate`) and now produces `<project>`. `null` still means the aggregate. In-repo callers are unaffected.

Existing reviewers are unaffected: a name already remembered under `pinflow:r:<project>` still wins over minting, so their identity and their comments stay put.

**Two tabs no longer split a corpus.** A rename retires a storage key that another open tab may still be writing to, and identity resolution never looks at that key again — so the second tab's comments would vanish on reload. Each persist now checks whether the remembered reviewer has moved and folds forward into it. Folding a corpus into an existing one resolves duplicate ids by newest `updatedAt` (ties to the destination) rather than by id alone, which previously discarded the newer edit.

Core grows ~470 B (18.14 kB ESM gz), an approved trade against ceilings raised to 18.22 kB ESM / 18.56 kB IIFE.
