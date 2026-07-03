import { buildSelectors, findByCandidates, getTextFingerprint } from './selector';
import type { Anchor, PositionPercent, Viewport } from './types';

export function currentViewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function clickToPositionPercent(
  el: Element,
  clientX: number,
  clientY: number,
): PositionPercent {
  const rect = el.getBoundingClientRect();
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  const x = ((clientX - rect.left) / w) * 100;
  const y = ((clientY - rect.top) / h) * 100;
  return {
    x: Math.max(0, Math.min(100, Number(x.toFixed(2)))),
    y: Math.max(0, Math.min(100, Number(y.toFixed(2)))),
  };
}

export function buildAnchor(el: Element, clientX: number, clientY: number): Anchor {
  return {
    selectors: buildSelectors(el),
    textFingerprint: getTextFingerprint(el),
    positionPercent: clickToPositionPercent(el, clientX, clientY),
    viewport: currentViewport(),
  };
}

export function resolveAnchor(anchor: Anchor, root: Document = document): Element | null {
  return findByCandidates(root, anchor.selectors, anchor.textFingerprint);
}

export interface ScreenPosition {
  left: number;
  top: number;
}

export function anchorToScreen(el: Element, position: PositionPercent): ScreenPosition {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left + (rect.width * position.x) / 100,
    top: rect.top + (rect.height * position.y) / 100,
  };
}
