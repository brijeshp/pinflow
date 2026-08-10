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

// Traversal safety valve, separate from the scored-node budget above. Charging
// skipped tags against FINGERPRINT_WALK_LIMIT stops a <select> of <option>s
// outrunning the bound, but it also lets 1,500 <source> elements in an image
// gallery evict real content — the heal then lands on the page container,
// which is a wrong attach. Two counters: one bounds meaning, one bounds work.
const FINGERPRINT_VISIT_LIMIT = 20000;

// The count cap alone is device-dependent: 2,000 nodes measures ~1.5 ms on a
// laptop and ~9.5 ms on a mid-range phone, well past the 4 ms frame budget the
// anchor cache exists to protect. Whichever bound trips first wins.
const FINGERPRINT_WALK_MS = 2;

// Elements that can never be a legitimate pin target. HEAD's subtree matters
// most: <title>Checkout</title> is an exact-fingerprint candidate that would
// out-rank a real "Checkout" heading, because the deepest-wins rule only ever
// replaces a match with its own descendant. The rest carry text that is never
// rendered where the reviewer pointed. DESC/METADATA are the SVG equivalents.
//
// Matched against an UPPERCASED tagName: tagName preserves case outside the
// HTML namespace, so an SVG <title> reports 'title' and would otherwise slip
// through — as would every entry here inside an XHTML document.
const SKIP_TAG_RE =
  /^(HTML|BODY|HEAD|SCRIPT|STYLE|LINK|META|TITLE|DESC|METADATA|NOSCRIPT|TEMPLATE|BR|WBR|OPTION|TRACK|SOURCE)$/;

// The fingerprint's documented representation: at most this many normalised
// characters. Also the defensive cap on HYDRATED fingerprints — legit values
// are ≤ FP_MAX by construction, so anything longer is hostile or corrupt and
// gets truncated before any O(length) matching work (0.4.1 review #8).
export const FP_MAX = 80;

// Enough raw characters to yield FP_MAX normalised ones in any realistic
// markup. Doubles as the incremental extractor's chunk size.
const FP_SCAN_LIMIT = 2048;

// Fuzzy re-anchor acceptance floor. Conservatism beats recall here: a wrong
// re-anchor silently attaches feedback to the wrong element, which is worse
// than an honest orphan.
const FUZZY_THRESHOLD = 0.6;

// Below this fingerprint length, fuzzy matching is disabled outright: bigram
// sets of tiny strings make 'No' vs 'Not' score 0.67 (0.3.0 review #3).
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
  const raw = el.textContent ?? '';
  // PIN-CREATION extraction: full fidelity, one call per pin, cost immaterial.
  // Healing uses healFingerprint below instead — this function's textContent
  // read materialises the whole subtree, which review #7 barred from the
  // per-candidate heal path.
  //
  // A bare slice would be WRONG, though. Pretty-printed markup is mostly
  // indentation, so a fixed prefix can normalise to far fewer than 80 chars —
  // silently shortening fingerprints and orphaning every stored pin on
  // upgrade. So: try the prefix, and fall back to the full string only when it
  // did not yield enough. When it did, the first 80 characters are provably
  // identical to the full computation's, because normalisation is
  // left-to-right and the truncation boundary lies beyond character 80.
  if (raw.length <= FP_SCAN_LIMIT) return raw.replace(/\s+/g, ' ').trim().slice(0, FP_MAX);
  const head = raw.slice(0, FP_SCAN_LIMIT).replace(/\s+/g, ' ').trim();
  return (head.length >= FP_MAX ? head : raw.replace(/\s+/g, ' ').trim()).slice(0, FP_MAX);
}

// Healing-only extraction. `textContent` materialises the COMPLETE descendant
// text before any deadline can be consulted — one 86 kB container costs ~6 ms
// against the 2 ms heal budget, per candidate (0.4.1 review #7). This streams
// text nodes in FP_SCAN_LIMIT chunks instead, collapsing whitespace as it
// goes, and stops once enough characters exist to decide the fingerprint.
// Whitespace collapse is left-to-right, and chunk-collapse plus the boundary
// merge below equals a global collapse — so the first FP_MAX characters are
// provably identical to pin-time getTextFingerprint's, and stored pins keep
// matching. Returns null when the shared deadline expires mid-read; the
// candidate is then simply not judged. Full-fidelity extraction stays where
// it belongs: pin creation.
function healFingerprint(el: Element, deadline: number): string | null {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let out = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = node.nodeValue ?? '';
    for (let off = 0; off < data.length; off += FP_SCAN_LIMIT) {
      if (performance.now() > deadline) return null;
      const piece = data.slice(off, off + FP_SCAN_LIMIT).replace(/\s+/g, ' ');
      // A whitespace run split across a chunk or node boundary collapses to
      // ' ' on both sides — drop the duplicate.
      out += out.endsWith(' ') && piece.startsWith(' ') ? piece.slice(1) : piece;
      // +2 covers the at-most-one leading and trailing space trim removes, so
      // the first FP_MAX post-trim characters are already final.
      if (out.length >= FP_MAX + 2) return out.trim().slice(0, FP_MAX);
    }
  }
  return out.trim().slice(0, FP_MAX);
}

// A positional rung (css/xpath) proves only that something still sits at that
// path — not that it is the same thing. Recycled rows in a virtualised list
// keep satisfying a stale :nth-of-type, so the stored fingerprint gets a veto
// whenever it is long enough to be trustworthy.
function corroborates(el: Element, fingerprint: string, deadline: number): boolean {
  if (fingerprint.length < FUZZY_MIN_FP) return true;
  const fp = healFingerprint(el, deadline);
  // The pinned element provably carried ≥ FUZZY_MIN_FP chars of text when the
  // fingerprint was stored — an EMPTY node at that path is a recycled or
  // still-loading stranger, never confirmation (0.4.1 review #2). A deadline
  // expiry mid-read (fp === null) is equally unverified. Both demote the hit
  // to the last-resort fallback rather than confirming it.
  if (!fp) return false;
  return (
    fp === fingerprint ||
    dice(bigrams(fingerprint.toLowerCase()), bigrams(fp.toLowerCase())) >= FUZZY_THRESHOLD
  );
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
  // Hydrated fingerprints are untrusted input — cap to the documented
  // representation before ANY O(length) work (0.4.1 review #8).
  if (fingerprint.length > FP_MAX) fingerprint = fingerprint.slice(0, FP_MAX);
  // One deadline covers the WHOLE heal: positional corroboration reads text
  // at the same per-candidate cost as the walk, so it spends from the same
  // budget (0.4.1 review #7).
  const deadline = performance.now() + FINGERPRINT_WALK_MS;
  if (selectors.testid) {
    const hit = root.querySelector(`[data-testid="${CSS.escape(selectors.testid)}"]`);
    if (hit) return hit;
  }
  if (selectors.id) {
    const hit = root.querySelector(`#${CSS.escape(selectors.id)}`);
    if (hit) return hit;
  }
  // A positional hit that contradicts a strong stored fingerprint is demoted,
  // not discarded: it still beats a merely-fuzzy candidate at the bottom of
  // this function, and only an EXACT fingerprint match displaces it.
  //
  // Honest about the residual risk: this is not strictly conservative. When a
  // stale duplicate of the old text survives elsewhere (responsive blocks,
  // i18n, cached SSR shells) and the pinned element was legitimately rewritten,
  // the duplicate is an exact match and wins. That case is not decidable from
  // the DOM alone — the layout-eligibility gate in the walk catches the common
  // hidden variant, and nothing catches a visible one.
  let positional: Element | null = null;
  try {
    const hit = root.querySelector(selectors.css);
    if (hit) {
      if (corroborates(hit, fingerprint, deadline)) return hit;
      positional = hit;
    }
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
    if (node && node.nodeType === 1) {
      const hit = node as Element;
      if (corroborates(hit, fingerprint, deadline)) return hit;
      positional ??= hit;
    }
  } catch {
    /* xpath not supported or malformed */
  }
  if (fingerprint) {
    // Seed at <body> when walking a whole DOCUMENT: <head> is never a pin
    // target, and starting at the root spent walk budget on every <meta> and
    // <link> before reaching content. The nodeType test matters — an Element
    // root can expose an unrelated `.body` (a <form> with a control named
    // "body" does, via named-property access), which would silently redirect
    // the walk into the wrong subtree.
    const from = root.nodeType === 9 ? ((root as Document).body ?? root) : root;
    const walker = doc.createTreeWalker(from, NodeFilter.SHOW_ELEMENT);
    let count = 0;
    let visited = 0;
    let node = walker.nextNode();
    // One walk, two verdicts. textContent flows UP, so a wrapper mirrors its
    // child's fingerprint — both the exact and fuzzy passes therefore prefer
    // the DEEPEST element on a containment chain, and structural containers
    // (html/body) are never candidates: pinning <html> is how a heal once
    // persisted an empty css path (0.3.0 review #2).
    const want = bigrams(fingerprint.toLowerCase());
    const wantTag = tagFromCss(selectors.css);
    let exact: Element | null = null;
    let best: Element | null = null;
    let bestScore = 0;
    while (node) {
      const el = node as Element;
      // Once an exact match exists, only its own descendants can replace it
      // (the deepest-wins rule below). Pre-order traversal makes that subtree
      // contiguous, so the first non-descendant marks its end and nothing after
      // it can win — BREAK, not continue. Skipping instead walked the rest of
      // the document for nothing: 16,002 of 16,005 elements on a large page,
      // slower than doing no optimisation at all.
      if (exact && !exact.contains(el)) break;
      // Every node charges the visit budget and the clock, so no run of skipped
      // tags can outrun either. Sampling the clock here rather than below also
      // means a long skip run cannot escape the deadline.
      if (++visited >= FINGERPRINT_VISIT_LIMIT) break;
      // performance.now() is not free, so sample it. Every 16 rather than 64
      // because a body-seeded walk meets the largest containers first. Per-node
      // cost is bounded separately: healFingerprint streams chunks against
      // this same deadline, so a huge container can no longer smuggle a
      // multi-millisecond text read past the budget (0.4.1 review #7).
      if ((visited & 15) === 0 && performance.now() > deadline) break;
      if (SKIP_TAG_RE.test(el.tagName.toUpperCase())) {
        node = walker.nextNode();
        continue;
      }
      // Only nodes we actually score spend the semantic budget.
      if (count++ >= FINGERPRINT_WALK_LIMIT) break;
      const fp = healFingerprint(el, deadline);
      if (fp === fingerprint) {
        // Layout eligibility gates ACCEPTANCE: a zero-box element can never be
        // what the reviewer pointed at, and accepting one here would display
        // the pin at a zero rect and persist the hidden stranger's selectors
        // as a heal (0.4.1 review #3). Skip it and keep walking — a later
        // visible duplicate must still win. One layout read per exact match,
        // which is rare by construction.
        if (el.getClientRects().length > 0) {
          if (!exact || exact.contains(el)) exact = el;
        } else if (exact && exact.contains(el)) {
          // textContent flows UP, so the current exact may be a visible
          // wrapper mirroring THIS hidden descendant — the chain's true text
          // carrier. Anchoring to the wrapper pins invisible text; drop it
          // and let a later visible duplicate (or an honest orphan) win.
          exact = null;
        }
      } else if (!exact && fp && fingerprint.length >= FUZZY_MIN_FP) {
        // The floor gates RAW similarity — the tag bias must never smuggle a
        // sub-threshold match through (0.3.0 review #3). Fuzzy is a lightly-
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
    // Ordering is load-bearing. `positional` outranks `best` because a css or
    // xpath hit is structural evidence, while `best` is a 0.6-similarity guess
    // — letting a stranger win there attaches the comment to unrelated content,
    // and _persistHeal then writes that element into anchor.selectors, so the
    // next load corroborates the stranger trivially and the original anchor is
    // gone for good.
    //
    // Only an EXACT fingerprint match displaces a positional hit — and exact
    // is laid-out by construction (acceptance above requires a client rect).
    return exact ?? positional ?? best;
  }
  return positional;
}
