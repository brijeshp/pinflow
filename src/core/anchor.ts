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

// Nearest heading above the element, cheaply: walk ancestors; at each level
// scan preceding siblings closest-first, taking the sibling itself if it is a
// heading, else the LAST heading inside it (the one nearest the element).
function nearestHeading(el: Element): string | undefined {
  for (let cur: Element | null = el; cur && cur !== document.body; cur = cur.parentElement) {
    for (let sib = cur.previousElementSibling; sib; sib = sib.previousElementSibling) {
      const hs = /^H[1-6]$/.test(sib.tagName) ? [sib] : sib.querySelectorAll('h1,h2,h3,h4,h5,h6');
      const hit = hs[hs.length - 1];
      if (hit) return getTextFingerprint(hit);
    }
  }
  return undefined;
}

function elementContext(el: Element): NonNullable<Anchor['context']> {
  const ctx: NonNullable<Anchor['context']> = {
    role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
  };
  const name = el.getAttribute('aria-label') ?? getTextFingerprint(el);
  if (name) ctx.name = name;
  const heading = nearestHeading(el);
  if (heading) ctx.heading = heading;
  return ctx;
}

export function buildAnchor(el: Element, clientX: number, clientY: number): Anchor {
  return {
    selectors: buildSelectors(el),
    textFingerprint: getTextFingerprint(el),
    positionPercent: clickToPositionPercent(el, clientX, clientY),
    viewport: currentViewport(),
    context: elementContext(el),
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
