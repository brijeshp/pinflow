import { now } from './time';
import type { Comment, ReviewerStore } from './types';

// Exported: exportJSON's `pinflowExport` field shares this version namespace —
// "v3" means one thing everywhere (storage blob, JSON export, sync protocol).
export const SCHEMA_VERSION = 3;
// `c` = comments store; kept short to save bundle bytes and to avoid
// colliding with other pinflow:* keys (e.g. the identity key in identity.ts,
// which lives under `pinflow:r:<project>`).
const KEY_PREFIX = 'pinflow:c:';

interface PersistedStore extends ReviewerStore {
  schemaVersion: number;
}

// Components are URI-encoded so a ':' inside a project or reviewer name can't
// alias another namespace (review #19: project "a" + reviewer "b:c" must
// never equal project "a:b" + reviewer "c"). Colon-free values — every real
// deployment observed — encode to themselves, so existing keys are unchanged.
export function storageKey(project: string, reviewer: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(project)}:${encodeURIComponent(reviewer)}`;
}

/** Pre-encoding key shape; read-side fallback only, never written. */
function legacyStorageKey(project: string, reviewer: string): string {
  return `${KEY_PREFIX}${project}:${reviewer}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isPersistedStore(v: unknown): v is {
  schemaVersion: number;
  reviewer: string;
  project: string;
  createdAt?: unknown;
  comments?: unknown;
} {
  return (
    isObject(v) &&
    typeof v['schemaVersion'] === 'number' &&
    v['schemaVersion'] >= 1 &&
    typeof v['reviewer'] === 'string' &&
    typeof v['project'] === 'string'
  );
}

// The anchor sub-shape export/render dereference without guards: selectors
// (with a string `css`), positionPercent, and viewport must all be objects or
// the record is dropped rather than admitted to crash export later.
function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function optStr(v: unknown): boolean {
  return v === null || v === undefined || typeof v === 'string';
}

function validContext(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isObject(v)) return false;
  if (!optStr(v['name']) || !optStr(v['role']) || !optStr(v['heading']) || !optStr(v['src']))
    return false;
  const styles = v['styles'];
  if (styles === undefined) return true;
  return isObject(styles) && Object.values(styles).every((s) => typeof s === 'string');
}

function validVoice(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isObject(v)) return false;
  const conf = v['confidence'];
  return (
    finite(v['durationMs']) &&
    v['durationMs'] >= 0 &&
    (conf === undefined || (finite(conf) && conf >= 0 && conf <= 1)) &&
    (v['interim'] === undefined || typeof v['interim'] === 'boolean') &&
    (v['edited'] === undefined || typeof v['edited'] === 'boolean') &&
    optStr(v['engine'])
  );
}

function hasValidAnchor(c: Record<string, unknown>): boolean {
  const anchor = c['anchor'];
  if (!isObject(anchor)) return false;
  const selectors = anchor['selectors'];
  const pos = anchor['positionPercent'];
  const vp = anchor['viewport'];
  // Numeric leaves are dereferenced unguarded downstream (Math.round on
  // export, pixel math on render) — NaN/absent must drop the record, not
  // produce "NaN%" artifacts (review #20).
  return (
    isObject(selectors) &&
    typeof selectors['css'] === 'string' &&
    optStr(selectors['testid']) &&
    optStr(selectors['id']) &&
    typeof selectors['xpath'] === 'string' &&
    isObject(pos) &&
    finite(pos['x']) &&
    finite(pos['y']) &&
    pos['x'] >= 0 &&
    pos['x'] <= 100 &&
    pos['y'] >= 0 &&
    pos['y'] <= 100 &&
    isObject(vp) &&
    finite(vp['width']) &&
    finite(vp['height']) &&
    vp['width'] > 0 &&
    vp['height'] > 0 &&
    // Optional shapes at their REAL locations (review r3: context lives on
    // the anchor, not the comment): reject records whose context, fingerprint,
    // or voice metadata would corrupt export or render.
    optStr(anchor['textFingerprint']) &&
    validContext(anchor['context']) &&
    validVoice(c['voice'])
  );
}

// Comments from localStorage are untrusted: drop malformed entries, coerce the
// string fields downstream code dereferences unguarded, and guarantee every
// survivor carries a `modality` (v1 stores predate the field). v3 disposition
// fields are optional: an invalid status/resolution is stripped, not fatal.
// Exported for the source-hydration boundary: host-supplied payloads get the
// exact same distrust as localStorage blobs (review #18).
export function normalizeComments(input: unknown): Comment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (c): c is Record<string, unknown> =>
        isObject(c) && typeof c['id'] === 'string' && hasValidAnchor(c),
    )
    .map((c) => {
      const out: Comment = {
        ...(c as unknown as Comment),
        text: typeof c['text'] === 'string' ? c['text'] : '',
        route: typeof c['route'] === 'string' ? c['route'] : '',
        createdAt: typeof c['createdAt'] === 'string' ? c['createdAt'] : '',
        modality: c['modality'] === 'voice' ? 'voice' : 'text',
      };
      const s = c['status'];
      if (s === 'open' || s === 'done' || s === 'declined') out.status = s;
      else delete out.status;
      const r = c['resolution'];
      if (typeof r === 'string') out.resolution = r.slice(0, 500);
      else delete out.resolution;
      return out;
    });
}

// Forward-tolerant migration. v1 → default modality 'text'; v2 → as-is (v3
// disposition fields simply absent); a NEWER version is read for its stable
// core fields rather than wiped. Genuinely foreign data → null.
function migrate(parsed: unknown): ReviewerStore | null {
  if (!isPersistedStore(parsed)) return null;
  return {
    reviewer: parsed.reviewer,
    project: parsed.project,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now(),
    comments: normalizeComments(parsed.comments),
  };
}

export function loadStore(
  storage: Storage,
  project: string,
  reviewer: string,
): ReviewerStore | null {
  let raw = storage.getItem(storageKey(project, reviewer));
  let legacy = false;
  if (!raw) {
    // Corpora written before component encoding (colon-bearing names only).
    raw = storage.getItem(legacyStorageKey(project, reviewer));
    legacy = raw !== null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // corrupt blob — discard
  }
  const store = migrate(parsed);
  // A legacy raw key is ambiguous ("a:b:c" parses two ways) — trust it only
  // when the blob's OWN embedded scope matches the request (review #19).
  if (legacy && store && (store.project !== project || store.reviewer !== reviewer)) return null;
  return store;
}

// Persistence failing (quota, private mode) is worth exactly one signal per
// session, not one per keystroke.
let warnedWriteFailure = false;

/** Guarded write — never throws. On failure the session degrades to in-memory. */
export function saveStore(storage: Storage, store: ReviewerStore): void {
  const payload: PersistedStore = { ...store, schemaVersion: SCHEMA_VERSION };
  try {
    storage.setItem(storageKey(store.project, store.reviewer), JSON.stringify(payload));
  } catch (err: unknown) {
    if (!warnedWriteFailure) {
      warnedWriteFailure = true;
      console.warn('[pinflow] failed to persist comments', err);
    }
  }
}

export function listReviewers(storage: Storage, project: string): string[] {
  const prefix = `${KEY_PREFIX}${encodeURIComponent(project)}:`;
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      try {
        out.push(decodeURIComponent(key.slice(prefix.length)));
      } catch {
        /* foreign malformed key — skip */
      }
    }
  }
  return out.sort();
}

export function loadAllStores(storage: Storage, project: string): ReviewerStore[] {
  return listReviewers(storage, project)
    .map((r) => loadStore(storage, project, r))
    .filter((s): s is ReviewerStore => s !== null);
}

export function emptyStore(project: string, reviewer: string): ReviewerStore {
  return {
    reviewer,
    project,
    createdAt: now(),
    comments: [],
  };
}

export function upsertComment(store: ReviewerStore, comment: Comment): ReviewerStore {
  const idx = store.comments.findIndex((c) => c.id === comment.id);
  const comments =
    idx === -1
      ? [...store.comments, comment]
      : store.comments.map((c, i) => (i === idx ? comment : c));
  return { ...store, comments };
}

export function deleteComment(store: ReviewerStore, id: string): ReviewerStore {
  return { ...store, comments: store.comments.filter((c) => c.id !== id) };
}

/**
 * Merge a `source`-hydrated server corpus into the local one, by comment id.
 * Pure — neither input is mutated.
 *
 * Semantics (the sync protocol's one subtle rule — see PROTOCOL.md):
 * - Content: the copy with the higher `updatedAt` wins WHOLE-comment; an exact
 *   tie resolves to the server copy (deterministic, and on a tie the two are
 *   the same write anyway).
 * - Disposition (`status`/`resolution`): the SERVER value always wins,
 *   including absence — the team sets disposition through the host, a
 *   reviewer's device never legitimately writes it, so a server copy without
 *   one CLEARS any local one.
 * - Server-only comments are appended (same reviewer, another device);
 *   local-only comments are KEPT (they may simply not have synced yet).
 * - Ordering: local order preserved, then unmatched server comments in server
 *   order.
 */
export function mergeComments(local: Comment[], server: Comment[]): Comment[] {
  const serverById = new Map(server.map((c) => [c.id, c]));
  const merged = local.map((l) => {
    const s = serverById.get(l.id);
    if (!s) return l;
    const base = l.updatedAt > s.updatedAt ? l : s;
    const out: Comment = { ...base };
    delete out.status;
    delete out.resolution;
    if (s.status !== undefined) out.status = s.status;
    if (s.resolution !== undefined) out.resolution = s.resolution;
    return out;
  });
  const localIds = new Set(local.map((c) => c.id));
  return [...merged, ...server.filter((c) => !localIds.has(c.id))];
}

export function clearProject(storage: Storage, project: string): void {
  for (const reviewer of listReviewers(storage, project)) {
    storage.removeItem(storageKey(project, reviewer));
  }
}
