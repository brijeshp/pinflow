import type { SelectorCandidates } from './types';

// Auto-generated / framework-internal IDs that we refuse to anchor on, since
// they change on every render. Covered: React useId (`:r1:`), Radix, Headless
// UI, Mantine, anything underscore-prefixed, and likely-hashed shortish IDs.
// The hashed branch requires a digit — legit semantic ids like `header`,
// `footer`, `sidebar` are pure letters and must stay anchorable.
const AUTO_ID_RE = /^(__|:r[0-9a-z]+:|radix-|headlessui-|mantine-|(?=.*\d)[a-z0-9]{6,}$)/i;

// Utility / state classes we skip when building a CSS segment. These change
// frequently and would make selectors brittle. Same digit requirement as
// AUTO_ID_RE on the hashed branch: `button`/`navbar`/`container` are legit.
const SKIP_CLASS_RE = /^(hover|focus|active|is-|has-|[a-z]+-[0-9]+|(?=.*\d)[a-z0-9]{6,})$/;

// Cap on how many elements we walk in the fingerprint fallback — DOMs can be
// huge and this is the last-ditch path.
const FINGERPRINT_WALK_LIMIT = 2000;

// Fuzzy re-anchor acceptance floor. Conservatism beats recall here: a wrong
// re-anchor silently attaches feedback to the wrong element, which is worse
// than an honest orphan.
const FUZZY_THRESHOLD = 0.6;

// Below this fingerprint length, fuzzy matching is disabled outright: bigram
// sets of tiny strings make 'No' vs 'Not' score 0.67 (codex 0.3.0 #3).
const FUZZY_MIN_FP = 12;

// Sørensen–Dice similarity over character bigrams — deterministic, no deps,
// and well-behaved on ≤80-char fingerprints.
function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return (2 * hit) / (a.size + b.size);
}

// The stored css path's last segment carries the pinned element's tag — the
// only tag record the anchor keeps. 'main > p.intro:nth-of-type(2)' → 'p'.
function tagFromCss(css: string): string | null {
  const seg = css.split('>').pop()?.trim() ?? '';
  const m = /^[a-z][a-z0-9-]*/i.exec(seg);
  return m ? m[0].toLowerCase() : null;
}

export function getStableId(el: Element): string | null {
  const id = el.id;
  if (!id || AUTO_ID_RE.test(id)) return null;
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
  for (const sibling of parent.children) {
    if (sibling === el) return n;
    if (sibling.tagName === el.tagName) n++;
  }
  return n;
}

function cssSegment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .filter((c) => !SKIP_CLASS_RE.test(c))
    .slice(0, 2)
    .map((c) => `.${CSS.escape(c)}`)
    .join('');
  return `${tag}${classes}:nth-of-type(${nthOfType(el)})`;
}

export function getCssPath(el: Element, maxDepth = 6): string {
  const parts: string[] = [];
  let current: Element | null = el;
  for (let i = 0; current && current.tagName !== 'HTML' && i < maxDepth; i++) {
    const stableId = getStableId(current);
    if (stableId) {
      parts.unshift(`#${CSS.escape(stableId)}`);
      break;
    }
    parts.unshift(cssSegment(current));
    current = current.parentElement;
  }
  return parts.join(' > ');
}

export function getXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  // Stop at BODY as well as HTML: the '/html/body/' prefix below already
  // covers both, so including body in the walk emitted '/html/body/body[1]/…'
  // — an xpath that resolves to nothing.
  while (
    current &&
    current.nodeType === 1 &&
    current.tagName !== 'HTML' &&
    current.tagName !== 'BODY'
  ) {
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
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
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
    const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT);
    let count = 0;
    let node = walker.nextNode();
    // One walk, two verdicts. textContent flows UP, so a wrapper mirrors its
    // child's fingerprint — both the exact and fuzzy passes therefore prefer
    // the DEEPEST element on a containment chain, and structural containers
    // (html/body) are never candidates: pinning <html> is how a heal once
    // persisted an empty css path (codex 0.3.0 #2).
    const want = bigrams(fingerprint.toLowerCase());
    const wantTag = tagFromCss(selectors.css);
    let exact: Element | null = null;
    let best: Element | null = null;
    let bestScore = 0;
    while (node && count++ < FINGERPRINT_WALK_LIMIT) {
      const el = node as Element;
      const tag = el.tagName;
      if (tag === 'HTML' || tag === 'BODY' || tag === 'HEAD') {
        node = walker.nextNode();
        continue;
      }
      const fp = getTextFingerprint(el);
      if (fp === fingerprint) {
        if (!exact || exact.contains(el)) exact = el;
      } else if (!exact && fp && fingerprint.length >= FUZZY_MIN_FP) {
        // The floor gates RAW similarity — the tag bias must never smuggle a
        // sub-threshold match through (codex 0.3.0 #3). Fuzzy is a lightly-
        // reworded-element rescue (first-user feedback: the edit loop broke
        // an anchor on almost every pass); an exact match anywhere wins.
        const raw = dice(want, bigrams(fp.toLowerCase()));
        if (raw >= FUZZY_THRESHOLD) {
          // Same-tag bias breaks text ties toward the element kind the
          // reviewer actually pinned (a <p> over a lookalike <div>).
          const score = raw + (wantTag && el.tagName.toLowerCase() === wantTag ? 0.05 : 0);
          if (score > bestScore || (score === bestScore && best !== null && best.contains(el))) {
            bestScore = score;
            best = el;
          }
        }
      }
      node = walker.nextNode();
    }
    return exact ?? best;
  }
  return null;
}
