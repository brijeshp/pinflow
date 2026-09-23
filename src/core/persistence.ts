import type { Comment } from './types';

/** Authored revision; silent anchor repair does not change what was exported. */
export function authoredRevision(c: Comment): string {
  return JSON.stringify([
    c.updatedAt,
    c.status ?? 'open',
    c.resolution ?? '',
    c.text,
    c.route,
    c.createdAt,
  ]);
}

/**
 * Apply only edits made since this tab's durable baseline. An unchanged stale
 * copy is not an upsert, and absence on disk is a deletion, not a missing add.
 * This protects completed writes across tabs; localStorage itself has no lock.
 */
export function reconcileSnapshots(
  base: Comment[],
  desired: Comment[],
  disk: Comment[],
): Comment[] {
  const before = new Map(base.map((c) => [c.id, c]));
  const wanted = new Map(desired.map((c) => [c.id, c]));
  const out = new Map(disk.map((c) => [c.id, c]));
  const same = (a: Comment | undefined, b: Comment | undefined): boolean =>
    JSON.stringify(a) === JSON.stringify(b);
  for (const old of base) {
    const next = wanted.get(old.id);
    if (same(old, next)) continue;
    const current = out.get(old.id);
    if (!current) continue; // another tab deleted it; edits never imply restore
    if (!next) {
      if (current.updatedAt < old.updatedAt || authoredRevision(current) === authoredRevision(old))
        out.delete(old.id);
    } else if (same(current, old)) {
      out.set(old.id, next);
    } else if (next.updatedAt > current.updatedAt) {
      // A local edit cannot reopen a disposition received in another tab.
      const merged = { ...next };
      delete merged.status;
      delete merged.resolution;
      if (current.status !== undefined) merged.status = current.status;
      if (current.resolution !== undefined) merged.resolution = current.resolution;
      out.set(old.id, merged);
    }
  }
  for (const next of desired) {
    if (before.has(next.id)) continue;
    const current = out.get(next.id);
    if (!current || next.updatedAt > current.updatedAt) out.set(next.id, next);
  }
  return [...out.values()];
}
