import {
  buildSelectors,
  findByCandidates,
  getTextFingerprint,
  healFingerprint,
  getTestId,
} from './selector';
import type { Anchor, SelectorCandidates, TargetEvidence } from './types';

export const ACTION =
  'button,a[href],input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="radio"],[role="switch"],[role="option"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';
export const LAYER = '[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog[open]';
/** A persisted relative XPath is untrusted: positional steps only, never a document-wide axis. */
export const PATH = /^([a-z][a-z0-9-]*\[\d+\]\/)*[a-z][a-z0-9-]*\[\d+\]$/i;
const TAG = /^[a-z][a-z0-9-]*$/i;

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

function identityCss(key: 'id' | 'testid', value: string): string {
  return key === 'id' ? '#' + CSS.escape(value) : '[data-testid="' + CSS.escape(value) + '"]';
}

// The entity's own text: the owner minus the anchored control beneath it, so
// fixing the pinned control's label does not read as a different row. A
// control that is the row's only text IS its label, so the full text stands
// in then. Null when the budget expires mid-read. The relative path is kept
// in XPath form (`td[2]/button[1]`) and queried as CSS, which a shadow root
// and the unit DOM both answer; `PATH` bounds what reaches querySelector.
function entityText(el: Element, path: string | undefined, deadline: number): string | null {
  let skip: Element | null = null;
  if (path)
    try {
      skip = el.querySelector(
        ':scope > ' + path.replace(/\[(\d+)\]/g, ':nth-of-type($1)').replace(/\//g, ' > '),
      );
    } catch {
      /* A malformed persisted path excludes nothing. */
    }
  const text = healFingerprint(el, deadline, skip);
  return text === '' && skip ? healFingerprint(el, deadline) : text;
}

// Same-tag nodes sharing the entity text, in document order. Null past the
// candidate cap or the budget: an incomplete scan proves nothing.
function lookalikes(
  root: Document | Element | ShadowRoot,
  tag: string,
  text: string,
  path: string | undefined,
  deadline: number,
): Element[] | null {
  if (!TAG.test(tag)) return null;
  const nodes = root.querySelectorAll(tag);
  if (nodes.length > 500) return null;
  const out = [...nodes].filter((el) => entityText(el, path, deadline) === text);
  return performance.now() > deadline ? null : out;
}

/**
 * Identity for a row/item or shadow host. A unique id/testid is identity; else
 * the entity text, plus the position among lookalikes when there are several.
 * `ambiguous` means the scan could not finish: a locator hint, never a constraint.
 */
export function targetEvidence(el: Element, anchor?: SelectorCandidates): TargetEvidence {
  const evidence: TargetEvidence = {
    selectors: buildSelectors(el),
    textFingerprint: getTextFingerprint(el),
  };
  const root = el.getRootNode() as Document | ShadowRoot;
  for (const key of ['id', 'testid'] as const) {
    const value = evidence.selectors[key];
    if (value && root.querySelectorAll(identityCss(key, value)).length === 1)
      evidence.identity = key;
  }
  const prefix = evidence.selectors.xpath + '/';
  if (anchor?.xpath.startsWith(prefix)) evidence.path = anchor.xpath.slice(prefix.length);
  // Capture runs once per pin; the budget is generous next to the 2 ms resolve.
  const deadline = performance.now() + 8;
  const text = entityText(el, evidence.path, deadline);
  if (text === null) {
    evidence.ambiguous = true;
    return evidence;
  }
  evidence.textFingerprint = text;
  if (evidence.identity) return evidence;
  const peers = lookalikes(root, el.localName, text, evidence.path, deadline);
  const ordinal = peers?.indexOf(el) ?? -1;
  if (ordinal < 0) evidence.ambiguous = true;
  else if (peers!.length > 1) {
    evidence.ordinal = ordinal;
    evidence.count = peers!.length;
  }
  return evidence;
}

export function captureBinding(
  el: Element,
  selectors: SelectorCandidates,
): Pick<Anchor, 'owner' | 'shadowPath'> {
  const out: Pick<Anchor, 'owner' | 'shadowPath'> = {};
  const owner = nearestOwner(el);
  const evidence = owner && targetEvidence(owner, selectors);
  // An owner the scan could not classify constrains nothing: the legacy ladder
  // is what main shipped, and a pin must never park at placement.
  if (evidence && !evidence.ambiguous) out.owner = evidence;
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
): Element | null {
  const { selectors, textFingerprint, path, identity } = owner;
  const deadline = performance.now() + 2;
  if (identity) {
    const value = selectors[identity];
    if (!value) return null;
    const hits = root.querySelectorAll(identityCss(identity, value));
    return hits.length === 1 && entityText(hits[0]!, path, deadline) === textFingerprint
      ? hits[0]!
      : null;
  }
  if (owner.ambiguous) return null;
  // The original row can move. Bound the candidate set; the lookalike count
  // must match exactly, so a filtered or grown set parks rather than guesses.
  const tag = selectors.xpath.split('/').pop()?.split('[')[0] ?? '';
  const peers = lookalikes(root, tag, textFingerprint, path, deadline);
  return peers?.length === (owner.count ?? 1) ? (peers[owner.ordinal ?? 0] ?? null) : null;
}

export function bindingRoot(
  anchor: Anchor,
  doc: Document,
  depth?: number,
): Document | ShadowRoot | null {
  if (anchor.shadowPath?.length === 0) return null;
  let root: Document | ShadowRoot = doc;
  for (const host of (anchor.shadowPath ?? []).slice(0, depth)) {
    // A host beyond the scan cap still has to be found to enter its root: the
    // ladder locates it exactly as main located the host it anchored on.
    const el: Element | null =
      resolveOwner(root, host) ??
      (host.ambiguous ? findByCandidates(root, host.selectors, host.textFingerprint) : null);
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
  const o = anchor.owner;
  if (!o || o.ambiguous) return true;
  const owner = nearestOwner(el);
  return (
    !!owner &&
    (!o.identity ||
      (o.identity === 'id' ? owner.id : getTestId(owner)) === o.selectors[o.identity]) &&
    entityText(owner, o.path, performance.now() + 2) === o.textFingerprint
  );
}
