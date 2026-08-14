# 0.7.0 — name-at-export: review request

**Read this whole file before starting. It is self-contained; you are not
expected to have prior context on this repo.**

Repo: `github.com/brijeshp/pinflow` (public, MIT). A ~17 KB zero-dependency
browser script that adds pin-and-comment annotation to any web page and exports
Markdown intended to be pasted into a coding agent. Reviewers install nothing —
the host adds one script tag and sends a link.

Under review: **PR #4**, branch `feat/061-name-at-export`, three commits off
`main` (`f52eeea` feature, `6afd953` wiki, `fa42176` marker). 19 files,
+519/−116; `src/` and `tests/` account for 13 files and +484/−105.

CI is green. Coverage 96.83% on `src/core/**` (gate 80%). Size budgets pass.
**None of that is the question** — see below.

---

## What the change does

Three coupled behaviours, all in service of one bug: every exported file said
`visitor`.

1. **The `window.prompt` at init is gone.** Reviewers are now minted a stable
   `anon_…` handle (`anonymousHandle()` in `src/core/identity.ts`) and get a
   comment corpus immediately, silently.
2. **The export sheet carries an optional name field.** Prefilled if known,
   skippable, Enter exports.
3. **Naming yourself moves your comments.** The localStorage key embeds the
   reviewer (`pinflow:c:<project>:<reviewer>`), so `renameReviewer()` in
   `src/core/storage.ts` copies to the new key, merges by comment id if a store
   already exists there, then deletes the source.

An unnamed export claims no author: the handle is a storage key, not a person,
so `exportReviewer()` drops the `— from` and the `Reviewer:` line, and
`exportFilename()` drops the who segment.

### Why it was built

The live site pins `cfg.reviewer = 'visitor'` for every visitor
(`pinflow-site`, `src/layouts/Base.astro:63`). That workaround exists because
core fired a native OS dialog on the marketing hero. Two consequences: every
reviewer's export was attributed to `visitor` **and every filename collided**
(`exportFilename` uses the same string), so multiple people's files pile into
one downloads folder as `(1)`, `(2)`. Separately, in a sandboxed iframe without
`allow-modals` — Lovable, Bolt, StackBlitz, CodeSandbox, i.e. where these
prototypes actually live — `prompt()` _throws_; the widget then returned an
inert handle **before** the boot line printed, so it failed with no console
output at all.

---

## Why you are being asked

This repo has a documented, repeating failure mode from the implementer:
**checks that pass for a reason other than the one intended.** Over the 0.4.1
cycle it produced five tests that were green against the code they claimed to
guard; two were caught by reviewers rather than by the implementer.

It happened again in this change, twice, and both were caught only by accident:

- A `renameReviewer` quota test spied on `Storage.prototype.setItem`. jsdom's
  `localStorage` has its own `setItem`, so the spy never intercepted and the
  "refused write" was never refused. It surfaced only because the test failed
  for the _opposite_ reason. Fixed to spy on the instance
  (`tests/core/storage.test.ts`, the "reports failure without destroying the
  source" case). **Check the fix actually bites.**
- A theme test asserted the exact string
  `@media (pointer:coarse){.input textarea{font-size:16px}}`. Extending that
  rule to the new field broke it. It was rewritten to parse the selector list
  (`tests/core/theme.test.ts`) — **verify the rewrite still fails if the rule
  is removed**, rather than matching a regex that can never miss.

So: assume nothing in the commit messages, the changeset, the wiki, or the PR
body is true because it is written down. Where a claim is checkable, check it.

---

## The seven things I most want challenged

Ranked by the implementer's own uncertainty, highest first. Items 1–3 are where
real user data is at stake.

### 1. `renameReviewer()` — data safety (`src/core/storage.ts`)

This moves a real person's comment corpus between keys. It is the highest
blast-radius code in the diff and it is new.

- Copy-then-delete is deliberate: a refused write must leave the source intact.
  **Is there any ordering or failure path where comments are lost or
  double-counted?**
- Merge semantics when the target key already holds a store: it keeps the
  target's copy of a duplicate id and appends only source-only comments. Is
  that the right choice, or should the newer `updatedAt` win? Note
  `mergeComments()` exists but was deliberately _not_ reused — its
  server-wins-for-`status` semantics are wrong for a local rename. Was that
  reasoning correct?
- The spread is `{...(target ?? source), project, reviewer: to, comments, schemaVersion}`.
  When a target exists, `createdAt` comes from the target and the source's is
  discarded. Does anything depend on that?
- **Two tabs.** Both open on the same project, one renames. What does the other
  write on its next save? This is not tested and I do not know the answer.

### 2. Sync hosts are never told the identity changed

A rename updates `_store.reviewer` locally and emits **no `onChange`**. For a
host using the sync protocol (`PROTOCOL.md`), comments were already pushed under
`anon_k3f9x`; after naming, local says `Brijesh` while the server still says
`anon_k3f9x`. `config.source()` is scoped to the current reviewer, so the next
hydration may fetch an empty set.

Is this a real defect for backend-backed hosts, or acceptable given `reviewer`
is documented as "a display label" and pinflow "never enforces identity"
(`src/core/types.ts`, the `source` doc block)? If it is a defect, is the fix an
`onChange` emission, a dedicated hook, or blocking rename when `source` is set?

### 3. `exportFilename()` is public API and its contract changed

`src/core/index.ts:173` re-exports it. The signature is unchanged but the
semantics gained a third case:

| `reviewer` | before                | now             |
| ---------- | --------------------- | --------------- |
| `null`     | `<project>-aggregate` | unchanged       |
| `''`       | `<project>-aggregate` | **`<project>`** |
| `"Sam"`    | `Sam-<project>`       | unchanged       |

Any external caller passing `''` and expecting the aggregate name now gets a
different filename. Is a minor bump right, or is this a breaking change? The
only in-repo caller besides the export path passes `null`
(`src/core/ui/annotator.ts:773`).

### 4. `isAnonymous()` is a prefix test

`name.startsWith('anon_')`. A host that sets `?reviewer=anon_dave` — or a real
person whose name is stored that way — is silently treated as unnamed and loses
attribution. Documented in the source as an accepted collision. **Is a prefix
test the right mechanism**, or should "unnamed" be tracked as state rather than
inferred from the string? Consider that the alternative costs bytes and a
second storage key.

### 5. Paths that export without passing through the name field

`_adoptTypedName()` runs inside `_handleReviewerExport()` only. These reach an
artifact without it:

- `Handle.downloadExport()` and `Handle.exportMarkdown()` (public API, no sheet)
- the builder drawer's "Export all" / "JSON" buttons
- `⌘/Ctrl+Shift+E` — routes through `_toggleSheet()`, so it _should_ be covered

`_nameEl` is nulled in `_closePanel()`. **Is there a path where the sheet closes
between the click and the read, or where a stale `_nameEl` from a previous sheet
is read?** Note `_handleReviewerExport` already has an ownership guard for the
async clipboard, but `_adoptTypedName()` runs _before_ the await.

### 6. Stealth's storage silence

Stealth passes no `mint` at init specifically so a page the reviewer never
activated leaves nothing in their storage; identity resolves on first gesture
via `resolveIdentity`. Verify that holds — including that no other init path
writes `pinflow:r:<project>` for a stealth install, and that
`_ensureIdentity()` still gates comment creation correctly now that it can
never fail.

### 7. Do the new tests actually bite?

Six new tests in `tests/core/export-naming.test.ts`, plus additions to
`storage`, `export`, `identity`, `init`, `theme`. For each, the question is
whether it would go red against the unfixed code. In particular:

- The "exports without attribution when the field is left blank" case — does it
  exercise the anonymous path, or would it pass even if `_displayName()`
  returned the handle? (It asserts the handle is absent, which should catch it —
  confirm.)
- The `init.test.ts` rewrites. Four tests there asserted the old prompt
  contract; one — "declining the prompt drops the activation" — was **deleted**
  as obsolete rather than replaced. Was anything of value lost with it?
- `tests/core/init.test.ts` now reaches the noop handle via `reviewer: ''`
  rather than a declined prompt. Is that the same path it used to test?

---

## Ground rules

- **Measure, don't infer.** If you claim a bug, produce the input and the
  observed wrong output. A failing test you wrote is the strongest form.
- **Prefix each finding with a confidence and a severity**, and say plainly when
  you could not verify something.
- **Report "I checked X and it was fine" for the seven items above**, so silence
  is distinguishable from an unexamined area.
- Nothing in this file is a hint about where bugs are. Item ordering reflects
  the implementer's anxiety, which has been wrong before.

### Environment

```bash
git clone https://github.com/brijeshp/pinflow && cd pinflow
git checkout feat/061-name-at-export
pnpm install
```

| Task              | Command                                            |
| ----------------- | -------------------------------------------------- |
| Unit tests        | `pnpm test`                                        |
| Single file       | `pnpm vitest run tests/core/export-naming.test.ts` |
| Coverage          | `pnpm test:coverage`                               |
| Typecheck         | `pnpm typecheck`                                   |
| Build             | `pnpm build`                                       |
| Size budgets      | `pnpm size`                                        |
| Diff under review | `git diff main...HEAD`                             |

A caveat on `pnpm test` totals: several tests are `it.runIf`-gated on build
artifacts existing, so the **absolute** test count shifts depending on whether
`dist/` is present. Compare per-file counts, not totals. Base → head is +14 with
nothing lost.

Live check (the demo has the widget loaded):

```bash
pnpm --dir demo build && pnpm --dir demo preview
```

Then in the console: `localStorage.clear()`, reload, and confirm no dialog
appears and `localStorage['pinflow:r:pinflow-dev-demo']` matches `/^anon_/`.

---

## Output

For each finding:

- **Severity** P1 (data loss, security, silent wrong output) / P2 (real defect,
  bounded) / P3 (smell, style, doc)
- **Confidence** and how you established it
- **Reproduction** — exact input → exact observed output
- **File and symbol** (line numbers rot; name the function)
- **Suggested fix**, or say you don't have one

Close with a verdict on the one question that matters:

> **Is the evidence that this change is safe actually evidence?**

---

## Known and accepted — do not re-report unless you can show real harm

- **Builder-mode aggregate exports show raw `anon_…` handles** for unnamed
  reviewers. Ugly, deliberately out of scope for this PR, and still an
  improvement on every reviewer sharing one name. Report it only if it breaks
  something.
- **Size ceilings were raised** 17.6 → 17.95 kB ESM and 17.95 → 18.32 kB IIFE.
  CI measures 17.90 / 18.27, leaving 50 B. Approved by the repo owner at the
  ideation's quoted 250–400 B; actual cost ~275 B.
- **A quota-refused rename produces an unattributed export.** The reviewer typed
  a name and it silently did not take. Chosen deliberately over the alternative
  (remember the name, strand the corpus, open empty next visit). Argue with the
  trade if you think it's wrong, but it is not an oversight.
- **`pinflow-site` still sets `cfg.reviewer = 'visitor'`.** Removing it is
  release-gated: the site pins 0.5.0, so dropping the line now restores the OS
  prompt on the hero, and bumping the pin before npm has 0.7.0 404s the widget.

## Not in scope

- The existing selector/heal ladder, the CSP work, and the export escaping —
  reviewed in the 0.4.1 cycle (`docs/audits/2026-08-09-*`), unchanged here.
- Voice, wrappers, the agent pack — untouched.
- Whether the feature should exist. It was specified by the repo owner and
  matches ideation item #1 in
  `docs/ideation/2026-08-06-competitive-response-ideation.md`.
