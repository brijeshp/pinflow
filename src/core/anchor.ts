import { buildSelectors, findByCandidates, getTestId, getTextFingerprint } from './selector';
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

const HEADINGS = 'h1,h2,h3,h4,h5,h6';

// Nearest heading above the element, cheaply: walk ancestors; at each level
// scan preceding siblings closest-first, taking the sibling itself if it is a
// heading, else the LAST heading inside it (the one nearest the element).
function nearestHeading(el: Element): string | undefined {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    for (let sib = cur.previousElementSibling; sib; sib = sib.previousElementSibling) {
      const hs = sib.matches(HEADINGS) ? [sib] : sib.querySelectorAll(HEADINGS);
      const hit = hs[hs.length - 1];
      if (hit) return getTextFingerprint(hit);
    }
  }
  return undefined;
}

// Computed-style micro-snapshot: the handful of properties feedback is
// usually ABOUT, captured at pin time (what the reviewer saw). Text color and
// font always have meaningful computed values (inherited counts) and ship on
// every pin (~60 B); bg/radius/bg-image are omitted at their defaults.
function visualSnapshot(el: Element): NonNullable<Anchor['context']>['styles'] | undefined {
  const cs = window.getComputedStyle(el);
  const styles: NonNullable<NonNullable<Anchor['context']>['styles']> = {};
  const bg = cs.backgroundColor;
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') styles.background = bg;
  const bgImg = cs.backgroundImage;
  if (bgImg && bgImg !== 'none') styles.backgroundImage = bgImg.slice(0, 200);
  if (cs.color) styles.color = cs.color;
  if (cs.fontSize) styles.fontSize = cs.fontSize;
  const family = cs.fontFamily
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  if (family) styles.fontFamily = family;
  // Alignment complaints ("left align this") are ambiguous between text
  // alignment and un-centring a `margin-inline: auto` block, and a page often
  // centres through more than one rule — the stylesheet says where the rules
  // are, not which one the reviewer meant. Omitted at the `start` initial
  // value, so it costs nothing on the pages that never set it.
  const align = cs.textAlign;
  if (align && align !== 'start') styles.textAlign = align;
  const radius = cs.borderRadius;
  if (radius && radius !== '0px') styles.radius = radius;
  return Object.keys(styles).length ? styles : undefined;
}

// Hosts put data-testid on the CONTROL (button, slider track), but the click
// lands on whatever is nested inside it (label span, icon). Anchoring the raw
// target would drop the testid and fall back to brittle css/xpath — so the
// whole anchor (selectors, fingerprint, context, positionPercent) is built
// from the nearest anchored ancestor. getTestId, not `closest('[data-testid]')`,
// so empty/whitespace testids are skipped consistently with capture.
export function anchorTarget(el: Element): Element {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (getTestId(cur)) return cur;
  }
  return el;
}

// What counts as a modal layer. `dialog` alone would match a closed native
// dialog on resolve — its subtree exists, display:none — so the open state is
// part of the definition on both sides.
const LAYER = '[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog[open]';

// The dialog's accessible name, best-effort: aria-label, then aria-labelledby
// (every referenced id, joined), then the first heading inside it — which is
// what a host's modal title almost always is when neither aria hook is set.
function layerName(dialog: Element): string | undefined {
  let name = dialog.getAttribute('aria-label');
  if (!name) {
    const ids = dialog.getAttribute('aria-labelledby');
    if (ids) {
      const doc = dialog.ownerDocument;
      name = ids
        .split(/\s+/)
        .map((id) => doc.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
    }
  }
  if (!name) {
    const h = dialog.querySelector(HEADINGS);
    if (h) name = getTextFingerprint(h);
  }
  return name ? name.slice(0, 80) : undefined;
}

function layerOf(el: Element): Anchor['layer'] {
  const dialog = el.closest(LAYER);
  if (!dialog) return undefined;
  const name = layerName(dialog);
  return name ? { role: 'dialog', name } : { role: 'dialog' };
}

export function buildAnchor(
  target: Element,
  clientX: number,
  clientY: number,
  // The area picker's pre-climb element: the block the rect was actually drawn
  // over. ONLY the heading moves. Selectors, fingerprint, name, role and
  // styles still describe the ANCHORED element — they must all agree or the
  // export block contradicts itself with nothing to explain the mismatch.
  // "nearest heading above here" is a fact about the POSITION, not a property
  // of the element, which is what makes it the one field safe to re-source.
  // `deep ?? el`, not `deep ?? target`: target can be deeper than el, and
  // walking from deeper can surface a different heading on every point pin.
  deep?: Element,
): Anchor {
  const el = anchorTarget(target);
  const fingerprint = getTextFingerprint(el);
  // Best-effort human context (accessible name, role, nearest heading) —
  // exports render "the 'Continue' button under 'Next section'" from it.
  const context: NonNullable<Anchor['context']> = {
    role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
  };
  // Accessible-name ladder: aria-label → img alt → text fingerprint.
  // Capped ≤80 like every context field (types.ts promise) — a CMS-length
  // alt must never balloon the anchor toward the host's payload bound.
  const name = el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? fingerprint;
  if (name) context.name = name.slice(0, 80);
  const heading = nearestHeading(deep ?? el);
  if (heading) context.heading = heading;
  const src = el instanceof HTMLImageElement ? el.src : el.getAttribute('src');
  if (src) context.src = src.slice(0, 200);
  const styles = visualSnapshot(el);
  if (styles) context.styles = styles;
  const anchor: Anchor = {
    selectors: buildSelectors(el),
    textFingerprint: fingerprint,
    positionPercent: clickToPositionPercent(el, clientX, clientY),
    viewport: currentViewport(),
    context,
  };
  const layer = layerOf(el);
  if (layer) anchor.layer = layer;
  return anchor;
}

// A layer pin is bound to its dialog, not to page geometry. The ladder runs
// scoped to each open dialog of the recorded name and accepts a hit only if
// that dialog CONTAINS it — an absolute xpath ignores its context node, and
// a css path is matched against the whole document, so either can land on
// the page underneath. No open dialog of that name, or no hit inside one,
// parks the pin: it never falls through to the page. The guide promises a
// removed element hides its pin; a closed modal is the common case of
// "removed", and healing onto `main` was breaking that promise.
export function resolveAnchor(anchor: Anchor, root: Document = document): Element | null {
  const layer = anchor.layer;
  if (!layer) return findByCandidates(root, anchor.selectors, anchor.textFingerprint);
  for (const dialog of Array.from(root.querySelectorAll(LAYER))) {
    if (layer.name !== undefined && layerName(dialog) !== layer.name) continue;
    const hit = findByCandidates(dialog, anchor.selectors, anchor.textFingerprint);
    if (hit && dialog.contains(hit)) return hit;
  }
  return null;
}

export interface ScreenPosition {
  left: number;
  top: number;
}

export function anchorToScreen(
  el: Element,
  position: PositionPercent,
  // Callers on the per-frame reflow path pass a shared rect so pin and
  // footprint cost ONE layout read per target (ce-review #6).
  rect: DOMRect = el.getBoundingClientRect(),
): ScreenPosition {
  return {
    left: rect.left + (rect.width * position.x) / 100,
    top: rect.top + (rect.height * position.y) / 100,
  };
}
