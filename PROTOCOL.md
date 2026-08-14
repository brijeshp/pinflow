# Pinflow Sync Protocol

Pinflow is zero-backend by default: comments live in `localStorage`. When a
host outgrows that, it brings its own backend by implementing **three verbs**
over the pinflow comment schema. Pinflow never ships or hosts storage — this
document is the entire contract between the library and any backend.

Versioned with the schema: this document describes **v4**.

## The data unit: `Comment`

The wire shape is the `Comment` interface in
[`src/core/types.ts`](./src/core/types.ts) — that file is normative; this
table is a summary.

| Field        | Type                              | Notes                                                                                           |
| ------------ | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `id`         | `string`                          | Stable, client-generated. The sync key for every verb.                                          |
| `createdAt`  | `string` (ISO 8601)               |                                                                                                 |
| `updatedAt`  | `string` (ISO 8601)               | Drives content merge (see below).                                                               |
| `route`      | `string`                          | Logical screen key (`routeKey`); groups exports.                                                |
| `fullUrl`    | `string`                          |                                                                                                 |
| `text`       | `string`                          | The comment body (or voice transcript).                                                         |
| `anchor`     | `Anchor`                          | Selectors + position + element context (name/role/heading, computed-style snapshot, image src). |
| `scope`      | `Scope?`                          | v4. The derived edit boundary: what a fix may change, and what it may not leave. See below.     |
| `modality`   | `'text' \| 'voice'`               |                                                                                                 |
| `voice`      | `VoiceMeta?`                      | Present iff `modality === 'voice'`.                                                             |
| `status`     | `'open' \| 'done' \| 'declined'?` | **Server-owned.** Absent = open.                                                                |
| `resolution` | `string?` (≤500 chars)            | **Server-owned.** Team's one-line disposition note.                                             |

Fields are additive across versions; unknown fields must be preserved or
ignored, never rejected.

## The three verbs

| Verb       | Library seam                         | Direction       |
| ---------- | ------------------------------------ | --------------- |
| **list**   | `config.source`                      | server → client |
| **upsert** | `config.onChange` (`add` / `update`) | client → server |
| **delete** | `config.onChange` (`delete`)         | client → server |

### list — `source: () => Promise<Comment[]>`

Called **once** per resolved reviewer identity (at init, or at first
activation in stealth mode). Hosts refresh by re-initializing; `localStorage`
makes that lossless. A rejection is silent — the local store stays
authoritative.

Configuring `source` also flips `exportUi: 'auto'` off: a synced host owns
collation, so the reviewer-side export chip/hotkey/popup action disappear.
Pass `exportUi: 'always'` if your host wants both.

### upsert / delete — `onChange(store, change)`

Fired after every persisted comment mutation with a change envelope:

```ts
onChange?: (
  store: ReviewerStore,
  change: { type: 'add' | 'update' | 'delete'; comment: Comment },
) => void;
```

The host owns transport, batching, debouncing, and retries. Exceptions are
caught and logged; they never break the annotator.

## Idempotency

- **Upsert by `id`**: `add` and `update` are the same server operation —
  insert or replace the row with that `id`. Replaying an envelope is safe.
- **Delete of a missing `id` is a no-op** (success, not an error).

## Merge semantics (client-side, on list)

Hydrated comments merge into the local store by `id`
(`mergeComments` in [`src/core/storage.ts`](./src/core/storage.ts)):

- **Content**: the copy with the higher `updatedAt` wins whole-comment; an
  exact tie resolves to the server copy.
- **Disposition** (`status`, `resolution`): the **server value always wins,
  including absence** — a server copy without a disposition clears a local
  one.
- Server-only comments are added; local-only comments are **kept** (they may
  not have synced yet).

Hydration-**applied** changes never re-emit through `onChange` — that
callback reports reviewer mutations, and echoing the host's own data back at
it would loop.

**Reconcile-on-load** is the one deliberate exception: after a successful
hydration merge, each local comment whose `id` is absent from the server list
is re-announced as an `add` change, and each local comment whose
`updatedAt` beats the server copy's (a lost update) is re-announced as an
`update`. A local-only comment either never synced
(a transient write failure the fire-and-forget pipe won't retry) or predates
sync — the re-announce routes it back through the host's write pipe and
repairs the gap. Safe because upserts are idempotent by `id`, and the server
can't have deleted it (backends have no member-comment delete in v3; the team
sets disposition, not existence). Backends need nothing new: a reconcile
`add` is indistinguishable from a slow first sync.

## The derived lane (`scope`, v4)

`scope` is **content, not disposition**. It follows the same rule as `text`
and `anchor`: the copy with the higher `updatedAt` wins whole-comment. A
server does not own it and must not invent one.

Three consequences a conformant backend has to get right:

- **Store and return it unchanged.** It is client-derived at creation and
  never re-resolved — re-deriving against a later DOM would attribute a
  boundary to a reviewer who never saw it.
- **A v4 field on a v3 backend is not an error.** Fields are additive and
  readers are forward-tolerant, so a backend that has never heard of `scope`
  simply round-trips it. What it must NOT do is echo a stale copy that strips
  it: the merge is whole-comment on `updatedAt`, so a stale server copy loses
  and the local scope survives.
- **Never accept `scope.source` on trust.** It originates as a page attribute
  (`data-pinflow-source`) and names a path an agent will open. The client
  validates it at capture, at hydration and at export; a backend rendering
  artifacts itself must validate too, or drop the field. The client-side
  validator is `validateSourcePath` in
  [`src/core/source-path.ts`](./src/core/source-path.ts).

Structure is total and there is no `kind` discriminator: `between` present
means an insertion, `members` present means a region, neither means a point.
No empty collection is ever written — **do not normalise `[]` to absent or
absent to `[]`**, because either rewrite changes what the annotation IS.

## Scope rules

- **`reviewer` is a display label, never authentication.** Which human owns a
  comment — and whether they may see it again — is entirely host territory
  (session possession, magic link, real auth, anything).
- In reviewer mode, **list returns only the current reviewer's comments**.
  All-reviewer hydration (builder mode) is not part of v3.
- **`status` and `resolution` are server-owned.** They are set by the team
  through the host's own review surface and delivered to reviewers via list.
  A conformant backend must never accept them from a client upsert — strip
  them server-side; the client-side merge independently refuses local values.

## Privacy expectations

A `Comment` carries page-derived data: the anchor's text fingerprint,
accessible name, nearest heading, a computed-style snapshot, and image URLs —
including CSS `background-image` URLs, which may embed signed/tokenized CDN
links. Backends store what reviewers saw — apply the same handling you would
to user-generated content, and mind the README's privacy note when prototypes
show sensitive data.

## Versioning

One namespace, one number: the `schemaVersion` stamped on localStorage blobs,
the `pinflowExport` field on JSON exports, and the version of this protocol
are the **same value** (`SCHEMA_VERSION` in
[`src/core/storage.ts`](./src/core/storage.ts), currently `4`). "v4" means one
thing everywhere. Versions are additive; readers are forward-tolerant (a newer
blob is read for its stable core fields, never wiped).

## Reference implementation: sensavera

Sensavera runs pinflow in production; its endpoints are the canonical
conformant backend:

- **upsert / delete**: `POST /v1/sessions/{id}/feedback-annotations` —
  accepts the `onChange` envelope; upserts by comment `id`, delete-of-missing
  is a no-op. Disposition fields are stripped from client payloads.
- **list** (planned): `GET /v1/sessions/{id}/feedback-annotations` — returns
  the session reviewer's comments, including `status`/`resolution`, in the
  `source` shape. Scoping is by session possession.
