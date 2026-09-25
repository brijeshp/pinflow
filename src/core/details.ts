import { cleanLabel } from './scope-limits';
import type { CaptureDetails, CaptureRect } from './types';

export const LAYOUT_KEYS = ['display', 'lineHeight', 'gap', 'overflow', 'width', 'height'] as const;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
function rect(v: unknown): CaptureRect | undefined {
  if (!object(v)) return;
  const out = {} as CaptureRect;
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const n = v[key];
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      Math.abs(n) > 1e7 ||
      ((key === 'width' || key === 'height') && n < 0)
    )
      return;
    out[key] = Math.round(n * 100) / 100;
  }
  return out;
}
export function normalizeDetails(value: unknown): CaptureDetails | undefined {
  if (!object(value)) return;
  const out: CaptureDetails = {};
  const text = cleanLabel(value['text'], 512);
  if (text) out.text = text;
  if (
    value['truncated'] === true ||
    (typeof value['text'] === 'string' && value['text'].length > 512)
  )
    out.truncated = true;
  if (Array.isArray(value['state'])) {
    const state = value['state']
      .slice(0, 12)
      .filter(
        (s): s is string =>
          typeof s === 'string' &&
          /^(checked|disabled|expanded|selected|pressed)=(true|false)$/.test(s),
      );
    if (state.length) out.state = [...new Set(state)];
  }
  for (const key of ['bounds', 'parentBounds'] as const) {
    const b = rect(value[key]);
    if (b) out[key] = b;
  }
  if (Array.isArray(value['textRects'])) {
    const boxes = value['textRects']
      .slice(0, 12)
      .map(rect)
      .filter((b): b is CaptureRect => !!b);
    if (boxes.length) out.textRects = boxes;
  }
  const layout = value['layout'];
  if (object(layout)) {
    const styles: NonNullable<CaptureDetails['layout']> = {};
    for (const key of LAYOUT_KEYS) {
      const v = cleanLabel(layout[key], 80);
      if (v) styles[key] = v;
    }
    if (Object.keys(styles).length) out.layout = styles;
  }
  if (
    value['limitation'] === 'canvas' ||
    value['limitation'] === 'frame' ||
    value['limitation'] === 'shadow-host'
  )
    out.limitation = value['limitation'];
  return Object.keys(out).length ? out : undefined;
}
