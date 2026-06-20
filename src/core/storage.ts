import { now } from './time';
import type { Comment, ReviewerStore } from './types';

const SCHEMA_VERSION = 2;
// `c` = comments store; kept short to save bundle bytes and to avoid
// colliding with other pinflow:* keys (e.g. the identity key in identity.ts,
// which lives under `pinflow:r:<project>`).
const KEY_PREFIX = 'pinflow:c:';

interface PersistedStore extends ReviewerStore {
  schemaVersion: number;
}

/** Outcome of a persistence attempt. Writes never throw — callers branch on this. */
export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' | 'stale' };

export function storageKey(project: string, reviewer: string): string {
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

// Comments from localStorage are untrusted: drop obviously malformed entries and
// guarantee every survivor carries a `modality` (v1 stores predate the field).
function normalizeComments(input: unknown): Comment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (c): c is Record<string, unknown> =>
        isObject(c) && typeof c['id'] === 'string' && isObject(c['anchor']),
    )
    .map((c) => ({
      ...(c as unknown as Comment),
      modality: c['modality'] === 'voice' ? 'voice' : 'text',
    }));
}

// Forward-tolerant migration. v1 → default modality 'text'; v2 → as-is; a NEWER
// version is read for its stable core fields rather than wiped (saveStore's
// read-before-write guard then refuses to clobber it). Genuinely foreign data → null.
function migrate(parsed: unknown): ReviewerStore | null {
  if (!isPersistedStore(parsed)) return null;
  return {
    reviewer: parsed.reviewer,
    project: parsed.project,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now(),
    comments: normalizeComments(parsed.comments),
  };
}

function quarantine(storage: Storage, key: string, raw: string): void {
  // Preserve the unparseable blob for forensics instead of letting the next
  // save silently overwrite salvageable bytes. Best-effort.
  try {
    storage.setItem(`${key}:corrupt`, raw);
  } catch {
    /* ignore */
  }
}

export function loadStore(
  storage: Storage,
  project: string,
  reviewer: string,
): ReviewerStore | null {
  const key = storageKey(project, reviewer);
  const raw = storage.getItem(key);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantine(storage, key, raw);
    return null;
  }
  return migrate(parsed);
}

function onDiskVersion(storage: Storage, key: string): number | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) && typeof parsed['schemaVersion'] === 'number'
      ? parsed['schemaVersion']
      : null;
  } catch {
    return null;
  }
}

function writeFailureReason(err: unknown): 'quota' | 'unavailable' {
  const name = err instanceof Error ? err.name : '';
  return /quota/i.test(name) ? 'quota' : 'unavailable';
}

export function saveStore(storage: Storage, store: ReviewerStore): SaveResult {
  const key = storageKey(store.project, store.reviewer);
  // Read-before-write: never clobber a store written by a NEWER build (would
  // silently destroy data this build can't represent).
  const existing = onDiskVersion(storage, key);
  if (existing !== null && existing > SCHEMA_VERSION) return { ok: false, reason: 'stale' };

  const payload: PersistedStore = { ...store, schemaVersion: SCHEMA_VERSION };
  try {
    storage.setItem(key, JSON.stringify(payload));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, reason: writeFailureReason(err) };
  }
}

export function listReviewers(storage: Storage, project: string): string[] {
  const prefix = `${KEY_PREFIX}${project}:`;
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    // Skip quarantined blobs so a corrupt entry never appears as a reviewer.
    if (key && key.startsWith(prefix) && !key.endsWith(':corrupt')) {
      out.push(key.slice(prefix.length));
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

export function clearProject(storage: Storage, project: string): void {
  for (const reviewer of listReviewers(storage, project)) {
    storage.removeItem(storageKey(project, reviewer));
  }
}
