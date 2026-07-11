# Pinflow Sync Protocol

Pinflow is zero-backend by default: comments live in `localStorage`. When a
host outgrows that, it brings its own backend by implementing **three verbs**
over the pinflow comment schema. Pinflow never ships or hosts storage — this
document is the entire contract between the library and any backend.

Versioned with the schema: this document describes **v3**.

## The data unit: `Comment`

The wire shape is the `Comment` interface in
[`src/core/types.ts`](./src/core/types.ts) — that file is normative; this
table is a summary.

| Field        | Type                              | Notes                                                      |
| ------------ | --------------------------------- | ---------------------------------------------------------- |
| `id`         | `string`                          | Stable, client-generated. The sync key for every verb.     |
| `createdAt`  | `string` (ISO 8601)               |                                                            |
| `updatedAt`  | `string` (ISO 8601)               | Drives content merge (see below).                          |
| `route`      | `string`                          | Logical screen key (`routeKey`); groups exports.           |
| `fullUrl`    | `string`                          |                                                            |
| `text`       | `string`                          | The comment body (or voice transcript).                    |
| `anchor`     | `Anchor`                          | Selector candidates + position + optional element context. |
| `modality`   | `'text' \| 'voice'`               |                                                            |
| `voice`      | `VoiceMeta?`                      | Present iff `modality === 'voice'`.                        |
| `status`     | `'open' \| 'done' \| 'declined'?` | **Server-owned.** Absent = open.                           |
| `resolution` | `string?` (≤500 chars)            | **Server-owned.** Team's one-line disposition note.        |

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
is re-announced as an `add` change. A local-only comment either never synced
(a transient write failure the fire-and-forget pipe won't retry) or predates
sync — the re-announce routes it back through the host's write pipe and
repairs the gap. Safe because upserts are idempotent by `id`, and the server
can't have deleted it (backends have no member-comment delete in v3; the team
sets disposition, not existence). Backends need nothing new: a reconcile
`add` is indistinguishable from a slow first sync.

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

A `Comment` carries page-derived text: the anchor's text fingerprint,
accessible name, and nearest heading. Backends store what reviewers saw —
apply the same handling you would to user-generated content, and mind the
README's privacy note when prototypes show sensitive data.

## Versioning

One namespace, one number: the `schemaVersion` stamped on localStorage blobs,
the `pinflowExport` field on JSON exports, and the version of this protocol
are the **same value** (`SCHEMA_VERSION` in
[`src/core/storage.ts`](./src/core/storage.ts), currently `3`). "v3" means one
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
