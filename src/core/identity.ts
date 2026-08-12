import { randomToken } from './id';

// Namespaced under `pinflow:r:` to avoid colliding with the comments store
// prefix (`pinflow:c:`) used in storage.ts.
const NAME_KEY_PREFIX = 'pinflow:r';

export interface IdentityDeps {
  url?: string;
  storage: Storage;
  project: string;
  /**
   * Mints an identity when neither the URL nor storage supplies one. Omitted
   * by stealth at init, which must not touch storage before its first
   * activation — identity resolves on the gesture instead.
   */
  mint?: () => string;
}

const ANON_PREFIX = 'anon_';

/**
 * A stable per-browser handle so a reviewer HAS an identity — and therefore a
 * corpus of their own — without being asked who they are. It is a storage key,
 * never a display name: `isAnonymous` gates it out of the export.
 */
export function anonymousHandle(): string {
  return `${ANON_PREFIX}${randomToken(9)}`;
}

/**
 * True for a minted handle. A host that passes `?reviewer=anon_x` by hand gets
 * treated as unnamed; that collision is theirs to avoid and costs only
 * attribution.
 */
export function isAnonymous(name: string): boolean {
  return name.startsWith(ANON_PREFIX);
}

function reviewerKey(project: string): string {
  return `${NAME_KEY_PREFIX}:${project}`;
}

// Best-effort, mirroring storage.ts's never-throw discipline: private modes /
// full quotas may reject the write; identity then just isn't remembered.
export function rememberReviewer(storage: Storage, project: string, name: string): void {
  try {
    storage.setItem(reviewerKey(project), name);
  } catch {
    /* non-persistent session */
  }
}

export function reviewerFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get('reviewer');
    return v && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

export function resolveReviewer(deps: IdentityDeps): string | null {
  const urlName = deps.url ? reviewerFromUrl(deps.url) : null;
  if (urlName) {
    rememberReviewer(deps.storage, deps.project, urlName);
    return urlName;
  }
  const stored = deps.storage.getItem(reviewerKey(deps.project));
  if (stored && stored.trim().length > 0) return stored.trim();
  if (deps.mint) {
    const name = deps.mint();
    rememberReviewer(deps.storage, deps.project, name);
    return name;
  }
  return null;
}

export function modeFromUrl(url: string): 'reviewer' | 'builder' | null {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get('mode');
    if (v === 'builder' || v === 'reviewer') return v;
    return null;
  } catch {
    return null;
  }
}
