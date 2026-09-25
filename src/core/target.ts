import { buildSelectors, getTextFingerprint, healFingerprint, getTestId } from './selector';
import type { Anchor, TargetEvidence } from './types';

export const ACTION =
  'button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="checkbox"],[role="switch"],[role="menuitem"]';
export const LAYER = '[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog[open]';

export function eventTarget(event: Event): Element | null {
  return (
    event.composedPath().find((node): node is Element => node instanceof Element) ??
    (event.target instanceof Element ? event.target : null)
  );
}

export function parentElement(el: Element): Element | null {
  const root = el.getRootNode();
  return el.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
}

export function containingLayer(el: Element): Element | null {
  for (let cur: Element | null = el; cur; cur = parentElement(cur))
    if (cur.matches(LAYER)) return cur;
  return null;
}

export function targetEvidence(el: Element): TargetEvidence {
  const evidence: TargetEvidence = {
    selectors: buildSelectors(el),
    textFingerprint: getTextFingerprint(el),
  };
  const root = el.getRootNode() as Document | ShadowRoot;
  for (const key of ['id', 'testid'] as const) {
    const value = evidence.selectors[key];
    const css =
      key === 'id'
        ? '#' + CSS.escape(value ?? '')
        : '[data-testid="' + CSS.escape(value ?? '') + '"]';
    if (value && root.querySelectorAll(css).length === 1) {
      evidence.identity = key;
      return evidence;
    }
  }
  const nodes = root.querySelectorAll(el.localName);
  const deadline = performance.now() + 2;
  if (
    nodes.length > 500 ||
    [...nodes].filter((node) => healFingerprint(node, deadline) === evidence.textFingerprint)
      .length !== 1 ||
    performance.now() > deadline
  )
    evidence.ambiguous = true;
  return evidence;
}

export function captureBinding(el: Element): Pick<Anchor, 'owner' | 'shadowPath'> {
  const out: Pick<Anchor, 'owner' | 'shadowPath'> = {};
  const owner = nearestOwner(el);
  if (owner) out.owner = targetEvidence(owner);
  let root = el.getRootNode();
  const hosts: TargetEvidence[] = [];
  while (root instanceof ShadowRoot && hosts.length < 8) {
    hosts.unshift(targetEvidence(root.host));
    root = root.host.getRootNode();
  }
  if (hosts.length) out.shadowPath = root instanceof ShadowRoot ? [] : hosts;
  if (owner && out.owner && owner.getRootNode() !== el.getRootNode()) {
    let depth = 0,
      ownerRoot = owner.getRootNode();
    while (ownerRoot instanceof ShadowRoot && depth < 8) {
      depth++;
      ownerRoot = ownerRoot.host.getRootNode();
    }
    out.owner.rootDepth = depth;
  }
  return out;
}

/** Resolve entity identity before considering an ordinal child locator. No fuzzy owners. */
export function resolveOwner(
  root: Document | Element | ShadowRoot,
  owner: TargetEvidence,
  allowEmpty = false,
): Element | null {
  const { selectors, textFingerprint } = owner;
  const deadline = performance.now() + 2;
  if (owner.ambiguous) return null;
  if (owner.identity) {
    const key = owner.identity,
      value = selectors[key];
    if (!value) return null;
    const css =
      key === 'id' ? '#' + CSS.escape(value) : '[data-testid="' + CSS.escape(value) + '"]';
    const hits = root.querySelectorAll(css);
    return hits.length === 1 && healFingerprint(hits[0]!, deadline) === textFingerprint
      ? hits[0]!
      : null;
  }
  if (!textFingerprint && !allowEmpty) return null;
  // The original row can move. Bound the candidate set and abstain on duplicates.
  const tag = selectors.xpath.split('/').pop()?.split('[')[0];
  if (!tag || !/^[a-z][a-z0-9-]*$/i.test(tag)) return null;
  const nodes = root.querySelectorAll(tag);
  if (nodes.length > 500) return null;
  const matches = [...nodes].filter((el) => healFingerprint(el, deadline) === textFingerprint);
  return performance.now() <= deadline && matches.length === 1 ? matches[0]! : null;
}

export function bindingRoot(
  anchor: Anchor,
  doc: Document,
  depth?: number,
): Document | ShadowRoot | null {
  if (anchor.shadowPath?.length === 0) return null;
  let root: Document | ShadowRoot = doc;
  for (const host of (anchor.shadowPath ?? []).slice(0, depth)) {
    const el = resolveOwner(root, host, true);
    if (!el?.shadowRoot) return null;
    root = el.shadowRoot;
  }
  return root;
}

export function nearestOwner(el: Element): Element | null {
  for (let node = parentElement(el); node; node = parentElement(node))
    if (node.matches('tr,li,article,[role="row"],[role="listitem"]')) return node;
  return null;
}

export function matchesOwner(anchor: Anchor, el: Element): boolean {
  if (!anchor.owner) return true;
  if (anchor.owner.ambiguous) return false;
  const owner = nearestOwner(el);
  return (
    !!owner &&
    (anchor.owner.identity
      ? (anchor.owner.identity === 'id' ? owner.id : getTestId(owner)) ===
        anchor.owner.selectors[anchor.owner.identity]
      : !!anchor.owner.textFingerprint) &&
    healFingerprint(owner, performance.now() + 2) === anchor.owner.textFingerprint
  );
}
