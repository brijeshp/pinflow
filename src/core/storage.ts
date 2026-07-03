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
// version is read for its stable core fields rather than wiped. Genuinely
// foreign data → null.
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
  const raw = storage.getItem(storageKey(project, reviewer));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // corrupt blob — discard
  }
  return migrate(parsed);
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
  const prefix = `${KEY_PREFIX}${project}:`;
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
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
