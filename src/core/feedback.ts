import { cleanLabel } from './scope-limits';
import type { FeedbackContext, PinflowConfig } from './types';

/** Allowlist and detach host/wire values. Unknown keys never enter the artifact. */
export function normalizeFeedback(value: unknown): FeedbackContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const out: FeedbackContext = {};
  if (raw['intent'] === 'instance' || raw['intent'] === 'component' || raw['intent'] === 'matching')
    out.intent = raw['intent'];
  for (const key of ['build', 'state', 'observed', 'expected', 'subject'] as const) {
    const text = cleanLabel(
      raw[key],
      key === 'build' || key === 'state' || key === 'subject' ? 120 : 1000,
    );
    if (text) out[key] = text;
  }
  for (const key of ['steps', 'acceptance'] as const) {
    const list = raw[key];
    if (!Array.isArray(list)) continue;
    const items = list
      .slice(0, 12)
      .map((item) => cleanLabel(item, 500))
      .filter((item): item is string => !!item);
    if (items.length) out[key] = items;
  }
  if (Array.isArray(raw['attachments'])) {
    const refs: NonNullable<FeedbackContext['attachments']> = [];
    for (const item of raw['attachments'].slice(0, 4)) {
      if (!item || (item.kind !== 'image' && item.kind !== 'video') || typeof item.ref !== 'string')
        continue;
      const ref = item.ref;
      // IDs are deliberately opaque. URLs must be passive HTTPS references with
      // no signed credentials; blobs/data URLs would stuff media into localStorage.
      let safe = /^[a-zA-Z0-9_-]{1,120}$/.test(ref);
      if (!safe && ref.length <= 500) {
        try {
          const url = new URL(ref);
          safe =
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            url.href === ref;
        } catch {
          /* invalid reference */
        }
      }
      if (!safe) continue;
      const label = cleanLabel(item.label);
      refs.push({ kind: item.kind, ref, ...(label ? { label } : {}) });
    }
    if (refs.length) out.attachments = refs;
  }
  return Object.keys(out).length ? out : undefined;
}

export function captureFeedback(
  hook: PinflowConfig['captureContext'],
  target: Element,
  point: import('./types').CapturePoint = { clientX: 0, clientY: 0 },
): FeedbackContext | undefined {
  try {
    return normalizeFeedback(hook?.(target, { ...point }));
  } catch {
    console.warn('[pinflow] captureContext failed');
    return undefined;
  }
}

/** Opt-in URL policy. Undefined preserves existing route identity for older installations. */
export function captureUrl(href: string, allowed: readonly string[] | undefined): string {
  if (!allowed) return href;
  try {
    const url = new URL(href);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (!allowed.includes(key) || key === 'reviewer' || key === 'mode')
        url.searchParams.delete(key);
    return url.href;
  } catch {
    return '/';
  }
}
