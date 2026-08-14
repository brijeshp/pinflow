# Blast radius (the scope model) — independent review request

**Read this whole file before starting. It is written to be self-contained; you
are not expected to have prior context on this repo.**

Repo: `github.com/brijeshp/pinflow` (public, MIT). A ~22 KB zero-dependency
browser script that adds pin-and-comment annotation to any web page and exports
Markdown intended to be pasted into a coding agent.

Under review: branch `feat/blast-radius-scope-model`, everything since
**`90b4e8c`** — 5 commits, 4 new source modules, 4 new test files.

```bash
git diff 90b4e8c...feat/blast-radius-scope-model --stat
```

Local state at the time of writing: `format:check`, `typecheck`, `build`,
`test:coverage` (723 tests, 96.78% statements against an 80% gate) and `size`
all pass. **E2E was not run locally** — no browsers installed in this
environment; CI runs it.

---

## What this release does, in one paragraph

Before it, a Pinflow annotation said **where** it was and **what** it was about.
It never said **how far a fix may go**. A pin recorded the nearest
`data-testid` ancestor and discarded what the reviewer actually tapped; a
marquee climbed until an ancestor fully contained the drawn rect, so a drag
ending mid-card silently escalated to the whole row. This release adds a
derived, visible, binding **scope** to every annotation: a boundary the agent
may not leave, a set of elements it may change, and a set it may not touch.

---

## Why you are being asked, and what to attack

This code has had no second pair of eyes. More importantly, **four of its tests
were caught passing for the wrong reason during development**, and that is this
repo's known failure shape — an earlier release produced five of them and two
were found by reviewers rather than the implementer. The four caught here:

| Test                                                                         | Why it was green while proving nothing                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `scope.test.ts` "rejects a wrapper by share-of-descendants"                  | The wrapper was being rejected on **viewport area**. Neutering `MAX_DESCENDANT_SHARE` left the entire suite green.   |
| `scope.test.ts` "no ancestor of an inside node appears in the exclusion set" | Asserted on a fixture with **no exclusions at all**, so the loop body never executed.                                |
| `annotator-scope.test.ts` "never renders the exclusions"                     | Driven through a **point pin**, which cannot produce an exclusion.                                                   |
| `export-scope.test.ts` "cannot forge an attribute"                           | Asserted the hostile value's _text_ was absent, but that text legitimately appears inside the single real attribute. |

All four were rewritten and every threshold, guard and cap in `scope.ts`,
`storage.ts` and `export.ts` was then verified by mutation — neutering each one
kills exactly the test that names it. **That process is itself what you should
distrust.** It was run by the same author as the code. Assume nothing is true
because it is written down, and where a claim is checkable, check it.

### The specific things most likely to be wrong

1. **The exclusion invariant.** `visit()` in `src/core/scope.ts` claims that an
   ancestor of an emitted node can never reach the exclusion branch, because
   recursion is driven by intersection rather than by band and any subtree that
   emits returns `true`. Is that actually total? Consider: a node capped out by
   `MEMBER_CAP` mid-walk (it returns `true` without pushing), a node skipped by
   `skip()`, a zero-area ancestor of a real member, and `NODE_CAP` tripping
   between a parent and its child.

2. **`MEMBER_CAP` reached mid-walk returns `true` and sets `truncated`.** That
   makes the parent report EMITTED without any member existing under it. Is
   there a case where this silently converts a region into something that
   renders as neither region nor insertion?

3. **The insertion branch.** `bracket()` only considers vertical relationships
   (`box.top + box.height <= region.top`). For a horizontal row a marquee in a
   gap will produce `between: {}` — an empty object, which is written to the
   record. Does that violate the "no empty collection" rule the schema claims,
   and does `**Insertion point:** inside the boundary above` read as useful or
   as noise?

4. **The point-pin ceiling change.** `resolveScope` climbs from
   `target.parentElement`, not `target`. Rationale is in the code. Check the
   consequence for a page where the pinned element's parent is itself the
   component — does the ceiling become uselessly wide, and does `tooWide` catch
   it?

5. **The source-path validator** (`src/core/source-path.ts`) is the one place
   escaping is not enough, since the value names a file an agent will open. It
   is a positive charset plus per-segment rules plus an extension allowlist.
   Try to get something through it. The test table has 30 rows; find row 31.
   Note especially: is rejecting only a leading `.` per segment sufficient, and
   is the extension allowlist reachable via a double extension
   (`CLAUDE.md.tsx`)?

6. **The mangling invariant.** `scope.ts` must contain zero `_`-prefixed
   identifiers, because tsup mangles `/^_/` on dotted access but not quoted
   access, mangles per entry point (IIFE and ESM write the same localStorage
   key), and never runs over the `dts` pass. The guard is
   `scope.test.ts` "scope.ts contains no \_-prefixed identifier", which strips
   comments with two regexes and then matches. **Is that guard defeatable?**
   A string literal, a template, a regex character class containing `_`.

7. **Injection.** Every scope value is page-derived: tag names, accessible
   names, css paths, and the host-supplied source path. They are rendered into
   `**Scope:**` / `**Change:**` / `**Do not change:**`, which this release made
   the most authoritative lines in the artifact. `attr()` gained `*`
   neutralisation for this reason. The structural AST guard in
   `export.test.ts` proves every `${…}` routes through an escaper — but it
   proves nothing about whether the _right_ escaper was chosen per field.

8. **Per-frame cost.** The claim is that `resolveScope` runs exactly once per
   placement and never on a reflow frame. `annotator-scope.test.ts` spies the
   module export, which raises the obvious question of whether the spy
   intercepts at all or whether the annotator holds a binding it cannot
   replace. That one is already settled: the test asserts the count is
   **exactly 1** after placement, so an inert spy would read 0 and fail. The
   half still worth attacking is the second assertion — `scroll` and `resize`
   are dispatched and the count is re-checked, but only after a single
   `requestAnimationFrame`. Is that enough to have flushed the reflow path, or
   does the annotator's rAF-throttled `_repositionPins` land a frame later,
   making the assertion vacuous?

9. **Armed-mode ownership.** The outline is one container with one idempotent
   `remove()`. Two ordering defects were already found here during development
   (the clear ran before its own guard, so every placement wiped the outline it
   had just painted; and `destroy()` reached the clear only through a path that
   early-returns). This surface has seventeen recorded leaks across the
   project's history. Look for a path that shows an outline and never clears
   it — particularly around voice, route change, and a second placement while a
   composer is already open.

---

## Known deviations, declared rather than hidden

Three things do not match the plan
(`docs/plans/2026-08-06-001-feat-blast-radius-scope-model-plan.md`). All are
deliberate; say if any is wrong.

1. **Ladder rung (c) uses a different signature than specified.** The plan's
   word-like class filter (`/^[a-z\-]{3,}$/i`) rejects `gap-4`, `w-1/2` and
   `md:flex` — blind in exactly the Tailwind output the rung targets — while the
   utility soup that passes is shared by every `<div>`. Replaced with the
   child-tag sequence, which is class-independent; class overlap survives only
   as a fallback for childless elements.

2. **The plan's acceptance criterion "no `onChange` emission" on abandon does
   not hold, and was not made to hold.** `_commitTextComment` has announced the
   empty comment at placement time since 0.1.0, so an abandoned draft has
   always emitted an `add` followed by a `delete`. Deferring the add until first
   save would change the write semantics of the sync protocol for every
   annotation — larger than this release. The test asserts the property that
   actually matters instead: the pair nets to zero on the same id. **Judge
   whether that deferral is acceptable.**

3. **Size is far over the plan's projection.** The plan budgeted +1.26–1.88 KB;
   actual is **+3.9 KB** (core 17.90/17.55 → 21.80/21.43 KB gz, macOS). The
   plan's figure assumed two of its three named byte-levers would be pulled
   (drop the touch marquee, drop rung (c)); the repo owner chose the full
   requirement set, so neither was. The ceilings in `package.json` are
   **provisional**, set from a local build with margin, and must be re-ratcheted
   to the linux CI actual before merge — a local number is not the gate, and
   0.6.0 already failed CI by one byte for trusting one.

   **A real question for you:** is +3.9 KB defensible for this feature, or is
   there a materially cheaper design? The `classes` field was already cut as
   redundant with the css path. Insertion records (R8) and rung (c) are the two
   largest remaining discretionary pieces.

---

## Ground rules

- **Fix implementations, not tests** — unless a test is provably wrong, in
  which case say why.
- Severity-band your findings (P1 data loss / injection / corruption, P2
  correctness, P3 quality) and state for each whether you **verified it by
  running something** or reasoned about it statically.
- If you believe a claim in this document is false, that is the most valuable
  finding you can return.

## Orientation

| Read                      | For                                             |
| ------------------------- | ----------------------------------------------- |
| `AGENTS.md`               | hard invariants CI enforces                     |
| `docs/wiki/core.md`       | engine internals, including the new modules     |
| `PROTOCOL.md`             | the sync contract, incl. the new derived lane   |
| `src/core/scope.ts`       | the engine — start with `visit()` and `climb()` |
| `src/core/source-path.ts` | the validator                                   |
| `src/core/export.ts`      | `scopeLines()` and the two escapers             |

```bash
pnpm install && pnpm test:coverage && pnpm size && pnpm build
```
