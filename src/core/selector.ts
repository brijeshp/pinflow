import type { SelectorCandidates } from './types';

const AUTO_ID_PATTERNS = [
  /^__/,
  /^:r[0-9a-z]+:/i, // React useId
  /^radix-/,
  /^headlessui-/,
  /^mantine-/,
  /^[a-z0-9]{6,}$/, // likely hashed
];

function isAutoId(id: string): boolean {
  return AUTO_ID_PATTERNS.some((p) => p.test(id));
}

export function getStableId(el: Element): string | null {
  const id = el.id;
  if (!id) return null;
  if (isAutoId(id)) return null;
  return id;
}

export function getTestId(el: Element): string | null {
  const v = el.getAttribute('data-testid');
  return v && v.trim().length > 0 ? v.trim() : null;
}

function nthOfType(el: Element): number {
  const parent = el.parentElement;
  if (!parent) return 1;
  let n = 1;
  for (const sibling of Array.from(parent.children)) {
    if (sibling === el) return n;
    if (sibling.tagName === el.tagName) n++;
  }
  return n;
}

function cssSegment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .filter((c) => !/^(hover|focus|active|is-|has-|[a-z]+-[0-9]+|[a-z0-9]{6,})$/.test(c))
    .slice(0, 2)
    .map((c) => `.${CSS.escape(c)}`)
    .join('');
  const index = nthOfType(el);
  return `${tag}${classes}:nth-of-type(${index})`;
}

export function getCssPath(el: Element, maxDepth = 6): string {
  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  while (current && current.tagName !== 'HTML' && depth < maxDepth) {
    const stableId = getStableId(current);
    if (stableId) {
      parts.unshift(`#${CSS.escape(stableId)}`);
      break;
    }
    parts.unshift(cssSegment(current));
    current = current.parentElement;
    depth++;
  }
  return parts.join(' > ');
}

export function getXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current.nodeType === 1 && current.tagName !== 'HTML') {
    let idx = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) idx++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${idx}]`);
    current = current.parentElement;
  }
  return `/html/body/${parts.join('/')}`;
}

export function getTextFingerprint(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 80);
}

export function buildSelectors(el: Element): SelectorCandidates {
  return {
    testid: getTestId(el),
    id: getStableId(el),
    css: getCssPath(el),
    xpath: getXPath(el),
  };
}

export function findByCandidates(
  root: Document | Element,
  selectors: SelectorCandidates,
  fingerprint: string,
): Element | null {
  if (selectors.testid) {
    const hit = root.querySelector(`[data-testid="${CSS.escape(selectors.testid)}"]`);
    if (hit) return hit;
  }
  if (selectors.id) {
    const hit = root.querySelector(`#${CSS.escape(selectors.id)}`);
    if (hit) return hit;
  }
  try {
    const hit = root.querySelector(selectors.css);
    if (hit) return hit;
  } catch {
    /* invalid selector */
  }
  const doc = root.ownerDocument ?? (root as Document);
  try {
    const result = doc.evaluate(
      selectors.xpath,
      root,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    const node = result.singleNodeValue;
    if (node && node.nodeType === 1) return node as Element;
  } catch {
    /* xpath not supported or malformed */
  }
  if (fingerprint) {
    const all = root.querySelectorAll('*');
    for (const el of Array.from(all)) {
      if (getTextFingerprint(el) === fingerprint) return el;
    }
  }
  return null;
}
