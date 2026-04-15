import type { Comment, ReviewerStore } from './types';

const SCHEMA_VERSION = 1;
const KEY_PREFIX = 'pinflow';

interface PersistedStore extends ReviewerStore {
  schemaVersion: number;
}

export function storageKey(project: string, reviewer: string): string {
  return `${KEY_PREFIX}:${project}:${reviewer}`;
}

export function loadStore(
  storage: Storage,
  project: string,
  reviewer: string,
): ReviewerStore | null {
  const raw = storage.getItem(storageKey(project, reviewer));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedStore;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
    return {
      reviewer: parsed.reviewer,
      project: parsed.project,
      createdAt: parsed.createdAt,
      comments: parsed.comments ?? [],
    };
  } catch {
    return null;
  }
}

export function saveStore(storage: Storage, store: ReviewerStore): void {
  const payload: PersistedStore = { ...store, schemaVersion: SCHEMA_VERSION };
  storage.setItem(storageKey(store.project, store.reviewer), JSON.stringify(payload));
}

export function listReviewers(storage: Storage, project: string): string[] {
  const prefix = `${KEY_PREFIX}:${project}:`;
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) out.push(key.slice(prefix.length));
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
    createdAt: new Date().toISOString(),
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
