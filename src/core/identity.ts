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
const HANDLE_LEN = 9;

/**
 * A stable per-browser handle so a reviewer HAS an identity — and therefore a
 * corpus of their own — without being asked who they are. It is a storage key,
 * never a display name: `isAnonymous` gates it out of the export.
 */
export function anonymousHandle(): string {
  return `${ANON_PREFIX}${randomToken(HANDLE_LEN)}`;
}

/**
 * True only for the exact shape `anonymousHandle()` mints. A prefix test also
 * swallowed real names — `anon_dave` as a URL param or a typed name lost its
 * attribution silently (0.7.0 review D). Matching the minted shape reserves
 * nothing a person would plausibly type.
 */
const ANON_SHAPE = new RegExp(`^${ANON_PREFIX}[a-z0-9]{${HANDLE_LEN}}$`);

export function isAnonymous(name: string): boolean {
  return ANON_SHAPE.test(name);
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

/**
 * The name this browser currently files comments under, or null. Exported
 * because a live widget has to notice when ANOTHER tab renames the reviewer —
 * writing under a retired key resurrects a corpus identity resolution will
 * never look at again (0.7.0 review #3).
 */
export function rememberedReviewer(storage: Storage, project: string): string | null {
  const v = storage.getItem(reviewerKey(project));
  return v && v.trim().length > 0 ? v.trim() : null;
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
  const stored = rememberedReviewer(deps.storage, deps.project);
  if (stored) return stored;
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
