// Namespaced under `pinflow:r:` to avoid colliding with the comments store
// prefix (`pinflow:c:`) used in storage.ts.
const NAME_KEY_PREFIX = 'pinflow:r';

export interface IdentityDeps {
  url?: string;
  storage: Storage;
  project: string;
  prompt?: (message: string) => string | null;
}

function reviewerKey(project: string): string {
  return `${NAME_KEY_PREFIX}:${project}`;
}

// Best-effort, mirroring storage.ts's never-throw discipline: private modes /
// full quotas may reject the write; identity then just isn't remembered.
function remember(storage: Storage, project: string, name: string): void {
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
    remember(deps.storage, deps.project, urlName);
    return urlName;
  }
  const stored = deps.storage.getItem(reviewerKey(deps.project));
  if (stored && stored.trim().length > 0) return stored.trim();
  if (deps.prompt) {
    const answer = deps.prompt("What's your name?");
    if (answer && answer.trim().length > 0) {
      const name = answer.trim();
      remember(deps.storage, deps.project, name);
      return name;
    }
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
